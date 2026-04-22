import * as vscode from "vscode";
import {
  ActionContext,
  ActionBatch,
  AdapterStatus,
  RiskLevel,
  ApprovalState,
  ActionType,
} from "../types";
import { BaseAdapter, createAdapterStatus } from "./interface";
import { getLogger } from "../logger";
import { getSettings } from "../settings";

/**
 * Generic adapter for unknown or unsupported AI coding extensions
 * Provides a fallback mechanism for detecting file system changes
 * Enhanced with debounce/coalescing for rapid file changes (Enhancement 10)
 */
export class GenericAdapter extends BaseAdapter {
  readonly name: string;
  readonly extensionId: string;
  readonly version = "1.0.0";

  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private pendingChanges: Map<string, ActionContext> = new Map();

  // Debounce state (Enhancement 10)
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debouncedChanges: Map<
    string,
    { uri: vscode.Uri; changeType: "create" | "change" | "delete" }
  > = new Map();

  constructor(extensionId: string = "generic") {
    super();
    this.extensionId = extensionId;
    this.name =
      extensionId === "generic"
        ? "Generic"
        : this.formatExtensionName(extensionId);
    this.setupFileWatcher();
  }

  /**
   * Format extension ID into a readable name
   */
  private formatExtensionName(extensionId: string): string {
    const parts = extensionId.split(".");
    if (parts.length >= 2) {
      const name = parts[parts.length - 1];
      return name
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    }
    return extensionId;
  }

  /**
   * Setup file system watcher for detecting changes
   * Enhanced with debounce/coalescing (Enhancement 10)
   */
  private setupFileWatcher(): void {
    const logger = getLogger();

    try {
      // Watch all files in workspace for changes
      this.fileWatcher = vscode.workspace.createFileSystemWatcher("**/*");

      this.fileWatcher.onDidChange((uri: vscode.Uri) => {
        logger.debug(`Generic: File changed - ${uri.fsPath}`);
        this.debouncedHandleFileChange(uri, "change");
      });

      this.fileWatcher.onDidCreate((uri: vscode.Uri) => {
        logger.debug(`Generic: File created - ${uri.fsPath}`);
        this.debouncedHandleFileChange(uri, "create");
      });

      this.fileWatcher.onDidDelete((uri: vscode.Uri) => {
        logger.debug(`Generic: File deleted - ${uri.fsPath}`);
        this.debouncedHandleFileChange(uri, "delete");
      });

      logger.debug("Generic adapter file watcher initialized");
    } catch (error) {
      logger.error(`Failed to setup file watcher: ${error}`);
    }
  }

  /**
   * Debounced file change handler (Enhancement 10)
   * Coalesces rapid file changes within the debounce window
   */
  private debouncedHandleFileChange(
    uri: vscode.Uri,
    changeType: "create" | "change" | "delete",
  ): void {
    const settings = getSettings();
    const debounceMs = settings.changeDebounceMs;

    if (debounceMs <= 0) {
      // No debounce — handle immediately
      this.handleFileChange(uri, changeType);
      return;
    }

    // Store the change (latest change type wins for the same file)
    this.debouncedChanges.set(uri.fsPath, { uri, changeType });

    // Reset the debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushDebouncedChanges();
    }, debounceMs);
  }

  /**
   * Flush all debounced changes as a batch
   */
  private flushDebouncedChanges(): void {
    const logger = getLogger();
    const changes = new Map(this.debouncedChanges);
    this.debouncedChanges.clear();
    this.debounceTimer = null;

    if (changes.size === 0) {
      return;
    }

    logger.debug(`Generic: Flushing ${changes.size} debounced file changes`);

    for (const [_filePath, { uri, changeType }] of changes) {
      this.handleFileChange(uri, changeType);
    }
  }

  /**
   * Handle file system change events
   */
  private handleFileChange(
    uri: vscode.Uri,
    changeType: "create" | "change" | "delete",
  ): void {
    const logger = getLogger();

    // Ignore non-workspace files
    if (!this.isInWorkspace(uri.fsPath)) {
      return;
    }

    // Ignore certain file types
    if (this.shouldIgnoreFile(uri.fsPath)) {
      return;
    }

    // Map change type to action type
    let actionType: ActionType;
    switch (changeType) {
      case "create":
        actionType = ActionType.CreateFiles;
        break;
      case "delete":
        actionType = ActionType.DeleteFiles;
        break;
      default:
        actionType = ActionType.EditFiles;
    }

    // Create action context
    const action: ActionContext = {
      id: this.generateActionId(),
      type: actionType,
      description: this.getActionDescription(actionType, uri.fsPath),
      files: [uri.fsPath],
      isWorkspaceFile: true,
      isSensitiveFile: this.isSensitiveFile(uri.fsPath),
      adapterName: this.name,
      timestamp: new Date(),
      riskLevel: RiskLevel.Low,
      requiredApproval: ApprovalState.Ask,
    };

    // Add to pending changes
    this.pendingChanges.set(uri.fsPath, action);

    // Emit action event
    this.emitAction(action);

    logger.debug(`Generic: Action created - ${actionType} on ${uri.fsPath}`);
  }

  /**
   * Check if file is in workspace
   */
  private isInWorkspace(filePath: string): boolean {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return false;
    }

    for (const folder of workspaceFolders) {
      const folderPath = folder.uri.fsPath.replace(/\\/g, "/").toLowerCase();
      const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();

      if (
        normalizedPath.startsWith(folderPath + "/") ||
        normalizedPath === folderPath
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if file should be ignored
   */
  private shouldIgnoreFile(filePath: string): boolean {
    const ignoredPatterns = [
      "node_modules",
      ".git",
      ".vscode",
      ".idea",
      "__pycache__",
      ".cache",
      ".tmp",
      ".log",
      ".lock",
    ];

    const lowerPath = filePath.toLowerCase();
    return ignoredPatterns.some(
      (pattern) =>
        lowerPath.includes("/" + pattern + "/") ||
        lowerPath.endsWith("/" + pattern),
    );
  }

  /**
   * Check if file is sensitive
   */
  private isSensitiveFile(filePath: string): boolean {
    const sensitivePatterns = [
      ".env",
      ".ssh",
      "secret",
      "token",
      "key",
      "password",
      "credential",
      ".pem",
      ".key",
      "secrets",
    ];

    const lowerPath = filePath.toLowerCase();
    return sensitivePatterns.some((pattern) => lowerPath.includes(pattern));
  }

  /**
   * Get description for action type
   */
  private getActionDescription(type: ActionType, filePath: string): string {
    const fileName = filePath.split("/").pop() || filePath;

    switch (type) {
      case ActionType.CreateFiles:
        return `Creating file: ${fileName}`;
      case ActionType.DeleteFiles:
        return `Deleting file: ${fileName}`;
      default:
        return `Editing file: ${fileName}`;
    }
  }

  /**
   * Check if the extension is active
   */
  public isActive(): boolean {
    if (this.extensionId === "generic") {
      return true; // Generic adapter is always active as fallback
    }
    return this.isExtensionInstalled(this.extensionId);
  }

  /**
   * Check if the adapter is enabled
   */
  public isEnabled(): boolean {
    return this.isActive();
  }

  /**
   * Get pending actions
   */
  public async getPendingActions(): Promise<ActionContext[]> {
    return Array.from(this.pendingChanges.values());
  }

  /**
   * Approve a specific action
   */
  public async approveAction(action: ActionContext): Promise<boolean> {
    this.lastActivity = new Date();
    this.pendingChanges.delete(action.files?.[0] || "");
    return true;
  }

  /**
   * Reject a specific action
   */
  public async rejectAction(action: ActionContext): Promise<boolean> {
    this.lastActivity = new Date();
    this.pendingChanges.delete(action.files?.[0] || "");
    return true;
  }

  /**
   * Approve all actions in a batch
   */
  public async approveBatch(batch: ActionBatch): Promise<boolean> {
    for (const action of batch.actions) {
      await this.approveAction(action);
    }
    return true;
  }

  /**
   * Reject all actions in a batch
   */
  public async rejectBatch(batch: ActionBatch): Promise<boolean> {
    for (const action of batch.actions) {
      await this.rejectAction(action);
    }
    return true;
  }

  /**
   * Get current adapter status
   */
  public getAdapterStatus(): AdapterStatus {
    return createAdapterStatus(
      this.name,
      this.version,
      this.isActive(),
      this.isEnabled(),
      this.pendingChanges.size,
    );
  }

  /**
   * Dispose the adapter
   */
  public override dispose(): void {
    super.dispose();
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingChanges.clear();
    this.debouncedChanges.clear();
  }
}
