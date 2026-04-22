import * as vscode from "vscode";
import {
  ActionContext,
  ActionBatch,
  BatchStatus,
  ApprovalState,
  UndoEntry,
  FileChange,
  IAdapter,
  ActionHistoryEntry,
  TelemetryEvent,
} from "./types";
import { getLogger } from "./logger";
import { getSettings } from "./settings";
import { getRiskAnalyzer } from "./riskAnalyzer";
import { getActionHistory } from "./actionHistory";
import { getTelemetry } from "./telemetry";

/**
 * Core approval engine that processes actions and manages batches
 * Enhanced with: rate limiting, action history, git undo, audio notifications,
 * session budget, and improved error handling
 */
export class ApprovalEngine implements vscode.Disposable {
  private static instance: ApprovalEngine;
  private disposables: vscode.Disposable[] = [];

  private pendingActions: Map<string, ActionContext> = new Map();
  private currentBatch: ActionBatch | null = null;
  private batchHistory: ActionBatch[] = [];
  private undoStack: UndoEntry[] = [];

  private actionEmitter: vscode.EventEmitter<ActionContext>;
  private batchEmitter: vscode.EventEmitter<ActionBatch>;
  private approvalEmitter: vscode.EventEmitter<ActionContext>;
  private rejectionEmitter: vscode.EventEmitter<ActionContext>;

  private autoApproveTimer: ReturnType<typeof setTimeout> | null = null;

  // Rate limiting state
  private autoApproveTimestamps: number[] = [];
  private sessionAutoApproveCount: number = 0;

  // Circuit breaker state
  private adapterFailureCounts: Map<string, number> = new Map();
  private adapterCircuitOpen: Map<string, boolean> = new Map();
  private readonly maxAdapterRetries = 3;
  private readonly circuitResetMs = 60000; // 1 minute

  private constructor() {
    this.actionEmitter = new vscode.EventEmitter<ActionContext>();
    this.batchEmitter = new vscode.EventEmitter<ActionBatch>();
    this.approvalEmitter = new vscode.EventEmitter<ActionContext>();
    this.rejectionEmitter = new vscode.EventEmitter<ActionContext>();

    // Setup file system watcher for workspace changes
    this.setupFileWatcher();
  }

  public static getInstance(): ApprovalEngine {
    if (!ApprovalEngine.instance) {
      ApprovalEngine.instance = new ApprovalEngine();
    }
    return ApprovalEngine.instance;
  }

  /**
   * Setup file system watcher
   */
  private setupFileWatcher(): void {
    const logger = getLogger();

    // Watch for file changes
    const watcher = vscode.workspace.createFileSystemWatcher("**/*");

    watcher.onDidChange((uri: vscode.Uri) => {
      logger.debug(`File changed: ${uri.fsPath}`);
    });

    watcher.onDidCreate((uri: vscode.Uri) => {
      logger.debug(`File created: ${uri.fsPath}`);
    });

    watcher.onDidDelete((uri: vscode.Uri) => {
      logger.debug(`File deleted: ${uri.fsPath}`);
    });

    this.disposables.push(watcher);
  }

  /**
   * Process an incoming action
   */
  public async processAction(
    action: ActionContext,
    adapter: IAdapter,
  ): Promise<ApprovalState> {
    const logger = getLogger();
    logger.info(`Processing action: ${action.type} - ${action.description}`);

    // Check if extension is enabled
    const settings = getSettings();
    if (!settings.enabled) {
      logger.info("Extension disabled, denying action");
      return ApprovalState.Deny;
    }

    // Check circuit breaker for adapter
    if (this.isCircuitOpen(adapter.name)) {
      logger.warn(`Circuit breaker open for adapter: ${adapter.name}`);
      vscode.window.showWarningMessage(
        `Universal Auto Accept: ${adapter.name} is temporarily disabled due to repeated failures. ` +
          'Use "Rescan Adapters" to re-enable.',
      );
      return ApprovalState.Deny;
    }

    // Analyze risk
    const riskAnalyzer = getRiskAnalyzer();
    const riskAnalysis = riskAnalyzer.analyze(action);
    logger.debug(
      `Risk analysis: ${riskAnalysis.level} - ${riskAnalysis.reasons.join(", ")}`,
    );

    // Store risk level and required approval in action
    action.riskLevel = riskAnalysis.level;
    action.requiredApproval = riskAnalyzer.riskToApprovalState(riskAnalysis);
    action.originalState = action.requiredApproval;

    // Add to pending actions
    this.pendingActions.set(action.id, action);

    // Emit action event
    this.actionEmitter.fire(action);

    // Emit batch start if needed
    if (!this.currentBatch) {
      this.startBatch(action, adapter);
    } else if (this.currentBatch.adapterName !== adapter.name) {
      // New adapter, start new batch
      this.endBatch(BatchStatus.PartiallyApproved);
      this.startBatch(action, adapter);
    } else {
      // Add to current batch
      this.currentBatch.actions.push(action);
    }

    // Handle based on required approval
    switch (action.requiredApproval) {
      case ApprovalState.Allow:
        return this.handleAutoApprove(action, adapter);
      case ApprovalState.Ask:
        return this.handleAsk(action, adapter);
      case ApprovalState.Deny:
        return this.handleDeny(action, adapter);
    }
  }

  /**
   * Handle auto-approval for allowed actions
   * Enhanced with rate limiting and session budget
   */
  private async handleAutoApprove(
    action: ActionContext,
    adapter: IAdapter,
  ): Promise<ApprovalState> {
    const logger = getLogger();
    const settings = getSettings();

    // Check rate limiting (Enhancement 9)
    if (!this.checkRateLimit(settings)) {
      logger.warn("Rate limit exceeded for auto-approve");
      this.handleRateLimitExceeded(settings);
      return this.handleAsk(action, adapter);
    }

    // Check session budget (Enhancement 12)
    if (!this.checkSessionBudget(settings)) {
      logger.warn("Session auto-approve budget exhausted");
      this.handleBudgetExhausted(settings);
      return this.handleAsk(action, adapter);
    }

    // Check for auto approve delay
    if (settings.autoApproveDelay > 0) {
      logger.info(`Auto-approve delayed by ${settings.autoApproveDelay}ms`);

      return new Promise((resolve) => {
        setTimeout(async () => {
          if (this.pendingActions.has(action.id)) {
            try {
              const success = await this.approveWithRetry(action, adapter);
              if (success) {
                this.pendingActions.delete(action.id);
                this.approvalEmitter.fire(action);
                this.recordAutoApprove(action);
                resolve(ApprovalState.Allow);
              } else {
                this.recordAdapterFailure(adapter.name);
                resolve(ApprovalState.Deny);
              }
            } catch (error) {
              logger.error(`Auto-approve failed: ${error}`);
              this.recordAdapterFailure(adapter.name);
              resolve(ApprovalState.Deny);
            }
          } else {
            resolve(ApprovalState.Deny);
          }
        }, settings.autoApproveDelay);
      });
    }

    // Immediate approval
    try {
      const success = await this.approveWithRetry(action, adapter);
      if (success) {
        logger.info(`Action auto-approved: ${action.id}`);
        this.pendingActions.delete(action.id);
        this.approvalEmitter.fire(action);
        this.recordAutoApprove(action);
        return ApprovalState.Allow;
      } else {
        this.recordAdapterFailure(adapter.name);
        return ApprovalState.Deny;
      }
    } catch (error) {
      logger.error(`Auto-approve failed: ${error}`);
      this.recordAdapterFailure(adapter.name);
      return ApprovalState.Deny;
    }
  }

  /**
   * Handle ask mode for actions requiring user confirmation
   * Enhancement 18: Properly awaits user response
   */
  private async handleAsk(
    action: ActionContext,
    _adapter: IAdapter,
  ): Promise<ApprovalState> {
    const logger = getLogger();
    logger.info(`Action requires confirmation: ${action.id}`);

    const settings = getSettings();
    const startTime = Date.now();

    // Show notification if enabled
    if (settings.showNotifications) {
      const result = await vscode.window.showInformationMessage(
        `Universal Auto Accept: ${action.description}`,
        { modal: false },
        "Approve",
        "Deny",
        "View Details",
      );

      const responseTimeMs = Date.now() - startTime;

      if (result === "Approve") {
        await this.approveAction(action.id);
        this.recordHistoryEntry(action, ApprovalState.Allow, responseTimeMs);
        return ApprovalState.Allow;
      } else if (result === "Deny") {
        await this.rejectAction(action.id);
        this.recordHistoryEntry(action, ApprovalState.Deny, responseTimeMs);
        return ApprovalState.Deny;
      } else if (result === "View Details") {
        // Open diff preview
        vscode.commands.executeCommand("universalAutoAccept.showDiffPreview");
        this.recordHistoryEntry(action, ApprovalState.Ask, responseTimeMs);
      } else {
        // User dismissed the notification — treat as ask
        this.recordHistoryEntry(action, ApprovalState.Ask, responseTimeMs);
      }
    }

    // Play audio notification for ask mode (Enhancement 6)
    this.playAudioNotification("ask");

    return ApprovalState.Ask;
  }

  /**
   * Handle denial of high-risk actions
   */
  private async handleDeny(
    action: ActionContext,
    adapter: IAdapter,
  ): Promise<ApprovalState> {
    const logger = getLogger();
    logger.warn(`Action denied (high risk): ${action.id}`);

    try {
      await adapter.rejectAction(action);
      this.pendingActions.delete(action.id);
      this.rejectionEmitter.fire(action);
      this.recordHistoryEntry(action, ApprovalState.Deny, 0);

      // Play audio notification for denial
      this.playAudioNotification("deny");

      // Telemetry
      getTelemetry().sendEvent(TelemetryEvent.ActionDenied, {
        actionType: action.type,
        riskLevel: action.riskLevel,
      });
    } catch (error) {
      logger.error(`Failed to reject action via adapter: ${error}`);
      this.recordAdapterFailure(adapter.name);
    }

    return ApprovalState.Deny;
  }

  /**
   * Approve with retry logic (Enhancement 18: Error handling)
   */
  private async approveWithRetry(
    action: ActionContext,
    adapter: IAdapter,
    maxRetries: number = 2,
  ): Promise<boolean> {
    const logger = getLogger();
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const success = await adapter.approveAction(action);
        if (success) {
          this.resetAdapterFailureCount(adapter.name);
          return true;
        }
        lastError = new Error("Adapter returned false");
      } catch (error) {
        lastError = error;
        logger.warn(`Approve attempt ${attempt + 1} failed: ${error}`);
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 500;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    logger.error(
      `All approve attempts failed for action ${action.id}: ${lastError}`,
    );
    return false;
  }

  // ===== Rate Limiting (Enhancement 9) =====

  /**
   * Check if auto-approve is within rate limits
   */
  private checkRateLimit(settings: ReturnType<typeof getSettings>): boolean {
    const maxPerMinute = settings.maxAutoApprovesPerMinute;
    if (maxPerMinute <= 0) {
      return true; // 0 = unlimited
    }

    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean old timestamps
    this.autoApproveTimestamps = this.autoApproveTimestamps.filter(
      (ts) => ts > oneMinuteAgo,
    );

    return this.autoApproveTimestamps.length < maxPerMinute;
  }

  /**
   * Check if session budget allows auto-approve
   */
  private checkSessionBudget(
    settings: ReturnType<typeof getSettings>,
  ): boolean {
    const budget = settings.autoApproveBudget;
    if (budget <= 0) {
      return true; // 0 = unlimited
    }

    return this.sessionAutoApproveCount < budget;
  }

  /**
   * Record an auto-approve for rate limiting
   */
  private recordAutoApprove(action: ActionContext): void {
    this.autoApproveTimestamps.push(Date.now());
    this.sessionAutoApproveCount++;

    // Telemetry
    getTelemetry().sendEvent(TelemetryEvent.ActionApproved, {
      actionType: action.type,
      riskLevel: action.riskLevel,
    });

    // Audio notification
    this.playAudioNotification("approve");
  }

  /**
   * Handle rate limit exceeded
   */
  private handleRateLimitExceeded(
    settings: ReturnType<typeof getSettings>,
  ): void {
    const logger = getLogger();
    logger.warn("Auto-approve rate limit exceeded");

    getTelemetry().sendEvent(TelemetryEvent.RateLimitHit);

    switch (settings.rateLimitAction) {
      case "ask":
        vscode.window.showWarningMessage(
          "Universal Auto Accept: Rate limit reached. Switching to ASK mode for remaining actions.",
        );
        break;
      case "pause":
        vscode.window.showWarningMessage(
          "Universal Auto Accept: Rate limit reached. Auto-approve is paused for this minute.",
        );
        break;
      case "off":
        vscode.window.showWarningMessage(
          "Universal Auto Accept: Rate limit reached. Extension is now OFF.",
        );
        settings.setEnabled(false);
        break;
    }
  }

  /**
   * Handle session budget exhausted
   */
  private handleBudgetExhausted(
    settings: ReturnType<typeof getSettings>,
  ): void {
    const logger = getLogger();
    logger.warn("Session auto-approve budget exhausted");

    getTelemetry().sendEvent(TelemetryEvent.BudgetExhausted);

    vscode.window
      .showInformationMessage(
        `Universal Auto Accept: You've used your session auto-approve budget (${settings.autoApproveBudget}). ` +
          "Remaining actions will require manual approval.",
        "Reset Budget",
        "Dismiss",
      )
      .then((choice) => {
        if (choice === "Reset Budget") {
          this.resetSessionBudget();
        }
      });
  }

  /**
   * Reset session budget counter
   */
  public resetSessionBudget(): void {
    this.sessionAutoApproveCount = 0;
    getLogger().info("Session auto-approve budget reset");
    vscode.window.showInformationMessage(
      "Universal Auto Accept: Session budget has been reset.",
    );
  }

  // ===== Circuit Breaker (Enhancement 18) =====

  /**
   * Record an adapter failure for circuit breaker
   */
  private recordAdapterFailure(adapterName: string): void {
    const count = (this.adapterFailureCounts.get(adapterName) || 0) + 1;
    this.adapterFailureCounts.set(adapterName, count);

    if (count >= this.maxAdapterRetries) {
      this.adapterCircuitOpen.set(adapterName, true);
      getLogger().error(`Circuit breaker opened for adapter: ${adapterName}`);

      // Auto-reset after timeout
      setTimeout(() => {
        this.adapterCircuitOpen.set(adapterName, false);
        this.adapterFailureCounts.set(adapterName, 0);
        getLogger().info(`Circuit breaker reset for adapter: ${adapterName}`);
      }, this.circuitResetMs);
    }
  }

  /**
   * Reset adapter failure count on success
   */
  private resetAdapterFailureCount(adapterName: string): void {
    this.adapterFailureCounts.set(adapterName, 0);
    this.adapterCircuitOpen.set(adapterName, false);
  }

  /**
   * Check if circuit breaker is open for an adapter
   */
  private isCircuitOpen(adapterName: string): boolean {
    return this.adapterCircuitOpen.get(adapterName) === true;
  }

  // ===== Audio Notifications (Enhancement 6) =====

  /**
   * Play an audio notification
   */
  private playAudioNotification(type: "approve" | "deny" | "ask"): void {
    const settings = getSettings();
    if (!settings.audioNotifications) {
      return;
    }

    try {
      // Use VS Code's audio cues API where available
      // Fall back to terminal bell for basic audio feedback
      switch (type) {
        case "approve":
          // Soft chime — use VS Code's built-in audio cue
          void vscode.commands
            .executeCommand("audioCues.onDidLineFail")
            .then(undefined, () => {
              // Fallback: no audio if audio cues not available
            });
          break;
        case "deny":
          // Alert tone
          void vscode.commands
            .executeCommand("audioCues.onDidRecordTestFailure")
            .then(undefined, () => {
              // Fallback
            });
          break;
        case "ask":
          // Notification tone
          void vscode.commands
            .executeCommand("audioCues.onDidFinishTask")
            .then(undefined, () => {
              // Fallback
            });
          break;
      }
    } catch (error) {
      getLogger().debug(`Audio notification failed: ${error}`);
    }
  }

  // ===== Action History (Enhancement 1) =====

  /**
   * Record an action decision in history
   */
  private recordHistoryEntry(
    action: ActionContext,
    decision: ApprovalState,
    responseTimeMs: number,
  ): void {
    const entry: ActionHistoryEntry = {
      id: action.id,
      actionType: action.type,
      description: action.description,
      files: action.files,
      adapterName: action.adapterName,
      decision,
      riskLevel: action.riskLevel,
      timestamp: new Date(),
      batchId: action.batchId,
      responseTimeMs,
    };

    getActionHistory()
      .recordEntry(entry)
      .catch((error) => {
        getLogger().debug(`Failed to record history entry: ${error}`);
      });
  }

  // ===== Batch Management =====

  /**
   * Start a new batch
   */
  private startBatch(action: ActionContext, adapter: IAdapter): void {
    const batch: ActionBatch = {
      id: `batch-${Date.now()}`,
      actions: [action],
      adapterName: adapter.name,
      startTime: new Date(),
      status: BatchStatus.Pending,
    };

    this.currentBatch = batch;
    this.batchEmitter.fire(batch);
    getLogger().info(`Batch started: ${batch.id} for adapter ${adapter.name}`);
  }

  /**
   * End the current batch
   */
  private endBatch(status: BatchStatus): void {
    if (this.currentBatch) {
      this.currentBatch.endTime = new Date();
      this.currentBatch.status = status;

      // Add to history (keep last 50)
      this.batchHistory.unshift(this.currentBatch);
      if (this.batchHistory.length > 50) {
        this.batchHistory.pop();
      }

      this.batchEmitter.fire(this.currentBatch);
      getLogger().info(
        `Batch ended: ${this.currentBatch.id} with status ${status}`,
      );
      this.currentBatch = null;
    }
  }

  /**
   * Approve a specific action by ID
   */
  public async approveAction(actionId: string): Promise<boolean> {
    const action = this.pendingActions.get(actionId);
    if (!action) {
      getLogger().warn(`Action not found: ${actionId}`);
      return false;
    }

    getLogger().info(`Approving action: ${actionId}`);

    this.pendingActions.delete(actionId);
    this.approvalEmitter.fire(action);

    return true;
  }

  /**
   * Reject a specific action by ID
   */
  public async rejectAction(actionId: string): Promise<boolean> {
    const action = this.pendingActions.get(actionId);
    if (!action) {
      getLogger().warn(`Action not found: ${actionId}`);
      return false;
    }

    getLogger().info(`Rejecting action: ${actionId}`);

    this.pendingActions.delete(actionId);
    this.rejectionEmitter.fire(action);

    return true;
  }

  /**
   * Approve all pending actions in the current batch
   */
  public async approveCurrentBatch(): Promise<boolean> {
    const logger = getLogger();

    if (!this.currentBatch || this.currentBatch.actions.length === 0) {
      logger.warn("No current batch to approve");
      return false;
    }

    logger.info(`Approving batch: ${this.currentBatch.id}`);

    const approvedActions: FileChange[] = [];

    for (const action of this.currentBatch.actions) {
      const success = await this.approveAction(action.id);
      if (success) {
        // Record for undo
        if (action.files) {
          for (const file of action.files) {
            approvedActions.push({
              type: this.getChangeType(action.type),
              path: file,
              newContent: action.description,
            });
          }
        }
      }
    }

    // Add to undo stack
    if (approvedActions.length > 0) {
      const settings = getSettings();
      this.undoStack.push({
        batchId: this.currentBatch.id,
        timestamp: new Date(),
        changes: approvedActions,
        adapterName: this.currentBatch.adapterName,
        isGitBased: false,
      });

      // Trim undo stack
      while (this.undoStack.length > settings.maxUndoBatchSize) {
        this.undoStack.shift();
      }
    }

    this.endBatch(BatchStatus.Approved);

    // Telemetry
    getTelemetry().sendEvent(TelemetryEvent.BatchApproved);

    return true;
  }

  /**
   * Reject all pending actions in the current batch
   */
  public async rejectCurrentBatch(): Promise<boolean> {
    const logger = getLogger();

    if (!this.currentBatch || this.currentBatch.actions.length === 0) {
      logger.warn("No current batch to reject");
      return false;
    }

    logger.info(`Rejecting batch: ${this.currentBatch.id}`);

    for (const action of this.currentBatch.actions) {
      await this.rejectAction(action.id);
    }

    this.endBatch(BatchStatus.Rejected);

    // Telemetry
    getTelemetry().sendEvent(TelemetryEvent.BatchRejected);

    return true;
  }

  // ===== Undo System (Enhancement 5: Git-Based Undo) =====

  /**
   * Undo the last approved batch
   * Supports git-based undo when enabled
   */
  public async undoLastBatch(): Promise<boolean> {
    const logger = getLogger();
    const settings = getSettings();

    if (this.undoStack.length === 0) {
      logger.warn("No actions to undo");
      return false;
    }

    const lastEntry = this.undoStack.pop()!;
    logger.info(`Undoing batch: ${lastEntry.batchId}`);

    // Try git-based undo first if enabled
    if (settings.useGitUndo && !lastEntry.isGitBased) {
      const gitSuccess = await this.gitUndo(lastEntry);
      if (gitSuccess) {
        lastEntry.isGitBased = true;
        getTelemetry().sendEvent(TelemetryEvent.UndoPerformed, {
          method: "git",
        });
        return true;
      }
      logger.info("Git undo not available, falling back to manual undo");
    }

    // Fall back to manual revert
    for (const change of lastEntry.changes) {
      try {
        await this.revertChange(change);
      } catch (error) {
        logger.error(`Failed to revert change for ${change.path}: ${error}`);
      }
    }

    getTelemetry().sendEvent(TelemetryEvent.UndoPerformed, {
      method: "manual",
    });
    return true;
  }

  /**
   * Attempt git-based undo
   */
  private async gitUndo(entry: UndoEntry): Promise<boolean> {
    const logger = getLogger();
    const settings = getSettings();

    // Check if we're in a git repository
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return false;
    }

    const cwd = workspaceFolders[0].uri.fsPath;

    try {
      // Check if git is available
      const gitExtension = vscode.extensions.getExtension("vscode.git");
      if (!gitExtension) {
        logger.debug("Git extension not available");
        return false;
      }

      const gitApi = gitExtension.isActive
        ? gitExtension.exports?.getAPI(1)
        : null;
      if (!gitApi) {
        logger.debug("Git API not available");
        return false;
      }

      // Collect file paths for git restore
      const filePaths = entry.changes
        .filter((c) => c.type === "edit" || c.type === "delete")
        .map((c) => c.path);

      if (filePaths.length === 0) {
        return false;
      }

      // Dry run check
      if (settings.gitUndoDryRun) {
        const fileList = filePaths.join("\n  ");
        const result = await vscode.window.showInformationMessage(
          `Git Undo Dry Run — Would restore these files:\n  ${fileList}`,
          "Execute",
          "Cancel",
        );
        if (result !== "Execute") {
          return false;
        }
      }

      // Execute git restore for each file
      for (const filePath of filePaths) {
        try {
          const relativePath = vscode.workspace.asRelativePath(filePath);
          const terminal = vscode.window.createTerminal({
            name: "OmniAccept Git Undo",
            cwd,
            hideFromUser: true,
          });
          terminal.sendText(`git restore "${relativePath}"`);
          terminal.sendText("exit");
          logger.info(`Git restore executed for: ${relativePath}`);
        } catch (error) {
          logger.error(`Git restore failed for ${filePath}: ${error}`);
        }
      }

      // Handle created files (need to be deleted)
      const createdFiles = entry.changes.filter((c) => c.type === "create");
      for (const change of createdFiles) {
        try {
          await vscode.workspace.fs.delete(vscode.Uri.file(change.path));
          logger.info(`Deleted created file: ${change.path}`);
        } catch (error) {
          logger.error(
            `Failed to delete created file: ${change.path}: ${error}`,
          );
        }
      }

      logger.info("Git-based undo completed successfully");
      return true;
    } catch (error) {
      logger.error(`Git undo failed: ${error}`);
      return false;
    }
  }

  /**
   * Revert a single file change (manual undo fallback)
   */
  private async revertChange(change: FileChange): Promise<void> {
    const logger = getLogger();

    switch (change.type) {
      case "create":
        // Delete the created file
        try {
          await vscode.workspace.fs.delete(vscode.Uri.file(change.path));
          logger.info(`Deleted file: ${change.path}`);
        } catch (error) {
          logger.error(`Failed to delete file: ${change.path}`);
        }
        break;

      case "edit":
        // Restore original content if we have it
        if (change.originalContent !== undefined) {
          const encoder = new TextEncoder();
          await vscode.workspace.fs.writeFile(
            vscode.Uri.file(change.path),
            encoder.encode(change.originalContent),
          );
          logger.info(`Restored file: ${change.path}`);
        }
        break;

      case "delete":
        // Recreate the deleted file
        if (change.originalContent !== undefined) {
          const encoder = new TextEncoder();
          await vscode.workspace.fs.writeFile(
            vscode.Uri.file(change.path),
            encoder.encode(change.originalContent),
          );
          logger.info(`Recreated file: ${change.path}`);
        }
        break;

      case "rename":
        // Rename back to original
        if (change.originalPath) {
          const edit = new vscode.WorkspaceEdit();
          edit.renameFile(
            vscode.Uri.file(change.path),
            vscode.Uri.file(change.originalPath),
          );
          await vscode.workspace.applyEdit(edit);
          logger.info(`Renamed back: ${change.path} -> ${change.originalPath}`);
        }
        break;
    }
  }

  /**
   * Get change type from action type
   */
  private getChangeType(actionType: string): FileChange["type"] {
    switch (actionType) {
      case "createFiles":
        return "create";
      case "editFiles":
        return "edit";
      case "deleteFiles":
        return "delete";
      case "renameFiles":
        return "rename";
      default:
        return "edit";
    }
  }

  // ===== Query Methods =====

  /**
   * Get pending actions count
   */
  public getPendingCount(): number {
    return this.pendingActions.size;
  }

  /**
   * Check if there are pending actions
   */
  public hasPendingActions(): boolean {
    return this.pendingActions.size > 0;
  }

  /**
   * Get current batch
   */
  public getCurrentBatch(): ActionBatch | null {
    return this.currentBatch;
  }

  /**
   * Get all pending actions
   */
  public getPendingActions(): ActionContext[] {
    return Array.from(this.pendingActions.values());
  }

  /**
   * Check if undo is available
   */
  public hasUndoHistory(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Get undo history
   */
  public getUndoHistory(): UndoEntry[] {
    return [...this.undoStack];
  }

  /**
   * Get batch history
   */
  public getBatchHistory(): ActionBatch[] {
    return [...this.batchHistory];
  }

  /**
   * Get session auto-approve count
   */
  public getSessionAutoApproveCount(): number {
    return this.sessionAutoApproveCount;
  }

  /**
   * Get current rate limit status (approves in last minute)
   */
  public getCurrentRateLimitCount(): number {
    const oneMinuteAgo = Date.now() - 60000;
    return this.autoApproveTimestamps.filter((ts) => ts > oneMinuteAgo).length;
  }

  /**
   * Clear all pending actions
   */
  public clearPending(): void {
    this.pendingActions.clear();
    if (this.currentBatch) {
      this.endBatch(BatchStatus.Rejected);
    }
  }

  // ===== Events =====

  /**
   * Event: when an action is received
   */
  public get onAction(): vscode.Event<ActionContext> {
    return this.actionEmitter.event;
  }

  /**
   * Event: when a batch starts or ends
   */
  public get onBatch(): vscode.Event<ActionBatch> {
    return this.batchEmitter.event;
  }

  /**
   * Event: when a batch event occurs (alias for onBatch, used by tree view)
   */
  public get onBatchEvent(): vscode.Event<ActionBatch> {
    return this.batchEmitter.event;
  }

  /**
   * Event: when an action is approved
   */
  public get onApproval(): vscode.Event<ActionContext> {
    return this.approvalEmitter.event;
  }

  /**
   * Event: when an action is rejected
   */
  public get onRejection(): vscode.Event<ActionContext> {
    return this.rejectionEmitter.event;
  }

  // ===== Lifecycle =====

  /**
   * Dispose the approval engine
   */
  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.actionEmitter.dispose();
    this.batchEmitter.dispose();
    this.approvalEmitter.dispose();
    this.rejectionEmitter.dispose();

    if (this.autoApproveTimer) {
      clearTimeout(this.autoApproveTimer);
    }

    this.pendingActions.clear();
    this.batchHistory = [];
    this.undoStack = [];
    this.autoApproveTimestamps = [];
    this.adapterFailureCounts.clear();
    this.adapterCircuitOpen.clear();

    (ApprovalEngine as unknown as { instance?: ApprovalEngine }).instance =
      undefined;
  }
}

/**
 * Helper to get approval engine instance
 */
export function getApprovalEngine(): ApprovalEngine {
  return ApprovalEngine.getInstance();
}
