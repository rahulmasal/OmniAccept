import * as vscode from 'vscode';
import {
    ActionContext,
    ActionBatch,
    BatchStatus,
    ApprovalState,
    UndoEntry,
    FileChange,
    IAdapter
} from './types';
import { getLogger } from './logger';
import { getSettings } from './settings';
import { getRiskAnalyzer } from './riskAnalyzer';

/**
 * Core approval engine that processes actions and manages batches
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

    private autoApproveTimer: NodeJS.Timeout | null = null;

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
        const watcher = vscode.workspace.createFileSystemWatcher('**/*');

        watcher.onDidChange((uri) => {
            logger.debug(`File changed: ${uri.fsPath}`);
        });

        watcher.onDidCreate((uri) => {
            logger.debug(`File created: ${uri.fsPath}`);
        });

        watcher.onDidDelete((uri) => {
            logger.debug(`File deleted: ${uri.fsPath}`);
        });

        this.disposables.push(watcher);
    }

    /**
     * Process an incoming action
     */
    public async processAction(
        action: ActionContext,
        adapter: IAdapter
    ): Promise<ApprovalState> {
        const logger = getLogger();
        logger.info(`Processing action: ${action.type} - ${action.description}`);

        // Check if extension is enabled
        const settings = getSettings();
        if (!settings.enabled) {
            logger.info('Extension disabled, denying action');
            return ApprovalState.Deny;
        }

        // Analyze risk
        const riskAnalyzer = getRiskAnalyzer();
        const riskAnalysis = riskAnalyzer.analyze(action);
        logger.debug(`Risk analysis: ${riskAnalysis.level} - ${riskAnalysis.reasons.join(', ')}`);

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
     */
    private async handleAutoApprove(
        action: ActionContext,
        adapter: IAdapter
    ): Promise<ApprovalState> {
        const logger = getLogger();
        const settings = getSettings();

        // Check for auto approve delay
        if (settings.autoApproveDelay > 0) {
            logger.info(`Auto-approve delayed by ${settings.autoApproveDelay}ms`);
            
            return new Promise((resolve) => {
                setTimeout(async () => {
                    if (this.pendingActions.has(action.id)) {
                        const success = await adapter.approveAction(action);
                        if (success) {
                            this.pendingActions.delete(action.id);
                            this.approvalEmitter.fire(action);
                            resolve(ApprovalState.Allow);
                        } else {
                            resolve(ApprovalState.Deny);
                        }
                    } else {
                        resolve(ApprovalState.Deny);
                    }
                }, settings.autoApproveDelay);
            });
        }

        // Immediate approval
        const success = await adapter.approveAction(action);
        if (success) {
            logger.info(`Action auto-approved: ${action.id}`);
            this.pendingActions.delete(action.id);
            this.approvalEmitter.fire(action);
            return ApprovalState.Allow;
        }

        return ApprovalState.Deny;
    }

    /**
     * Handle ask mode for actions requiring user confirmation
     */
    private async handleAsk(
        action: ActionContext,
        _adapter: IAdapter
    ): Promise<ApprovalState> {
        const logger = getLogger();
        logger.info(`Action requires confirmation: ${action.id}`);

        // Show notification if enabled
        const settings = getSettings();
        if (settings.showNotifications) {
            vscode.window.showInformationMessage(
                `Universal Auto Accept: ${action.description}`,
                'Approve', 'Deny', 'View Details'
            ).then(async (choice) => {
                if (choice === 'Approve') {
                    await this.approveAction(action.id);
                } else if (choice === 'Deny') {
                    await this.rejectAction(action.id);
                } else if (choice === 'View Details') {
                    // Open diff preview
                    vscode.commands.executeCommand('universalAutoAccept.showDiffPreview');
                }
            });
        }

        return ApprovalState.Ask;
    }

    /**
     * Handle denial of high-risk actions
     */
    private async handleDeny(
        action: ActionContext,
        adapter: IAdapter
    ): Promise<ApprovalState> {
        const logger = getLogger();
        logger.warn(`Action denied (high risk): ${action.id}`);

        await adapter.rejectAction(action);
        this.pendingActions.delete(action.id);
        this.rejectionEmitter.fire(action);

        return ApprovalState.Deny;
    }

    /**
     * Start a new batch
     */
    private startBatch(action: ActionContext, adapter: IAdapter): void {
        const batch: ActionBatch = {
            id: `batch-${Date.now()}`,
            actions: [action],
            adapterName: adapter.name,
            startTime: new Date(),
            status: BatchStatus.Pending
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
            getLogger().info(`Batch ended: ${this.currentBatch.id} with status ${status}`);
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
        
        // In a real implementation, this would communicate with the adapter
        // For now, we just remove from pending
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
            logger.warn('No current batch to approve');
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
                            newContent: action.description
                        });
                    }
                }
            }
        }

        // Add to undo stack
        if (approvedActions.length > 0) {
            this.undoStack.push({
                batchId: this.currentBatch.id,
                timestamp: new Date(),
                changes: approvedActions,
                adapterName: this.currentBatch.adapterName
            });

            // Trim undo stack
            const settings = getSettings();
            while (this.undoStack.length > settings.maxUndoBatchSize) {
                this.undoStack.shift();
            }
        }

        this.endBatch(BatchStatus.Approved);
        return true;
    }

    /**
     * Reject all pending actions in the current batch
     */
    public async rejectCurrentBatch(): Promise<boolean> {
        const logger = getLogger();

        if (!this.currentBatch || this.currentBatch.actions.length === 0) {
            logger.warn('No current batch to reject');
            return false;
        }

        logger.info(`Rejecting batch: ${this.currentBatch.id}`);

        for (const action of this.currentBatch.actions) {
            await this.rejectAction(action.id);
        }

        this.endBatch(BatchStatus.Rejected);
        return true;
    }

    /**
     * Undo the last approved batch
     */
    public async undoLastBatch(): Promise<boolean> {
        const logger = getLogger();

        if (this.undoStack.length === 0) {
            logger.warn('No actions to undo');
            return false;
        }

        const lastEntry = this.undoStack.pop()!;
        logger.info(`Undoing batch: ${lastEntry.batchId}`);

        // Revert each change
        for (const change of lastEntry.changes) {
            try {
                await this.revertChange(change);
            } catch (error) {
                logger.error(`Failed to revert change for ${change.path}: ${error}`);
            }
        }

        return true;
    }

    /**
     * Revert a single file change
     */
    private async revertChange(change: FileChange): Promise<void> {
        const logger = getLogger();

        switch (change.type) {
            case 'create':
                // Delete the created file
                try {
                    await vscode.workspace.fs.delete(vscode.Uri.file(change.path));
                    logger.info(`Deleted file: ${change.path}`);
                } catch (error) {
                    logger.error(`Failed to delete file: ${change.path}`);
                }
                break;

            case 'edit':
                // Restore original content if we have it
                if (change.originalContent !== undefined) {
                    const encoder = new TextEncoder();
                    await vscode.workspace.fs.writeFile(
                        vscode.Uri.file(change.path),
                        encoder.encode(change.originalContent)
                    );
                    logger.info(`Restored file: ${change.path}`);
                }
                break;

            case 'delete':
                // Recreate the deleted file
                if (change.originalContent !== undefined) {
                    const encoder = new TextEncoder();
                    await vscode.workspace.fs.writeFile(
                        vscode.Uri.file(change.path),
                        encoder.encode(change.originalContent)
                    );
                    logger.info(`Recreated file: ${change.path}`);
                }
                break;

            case 'rename':
                // Rename back to original
                if (change.originalPath) {
                    const edit = new vscode.WorkspaceEdit();
                    edit.renameFile(
                        vscode.Uri.file(change.path),
                        vscode.Uri.file(change.originalPath)
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
    private getChangeType(actionType: string): FileChange['type'] {
        switch (actionType) {
            case 'createFiles':
                return 'create';
            case 'editFiles':
                return 'edit';
            case 'deleteFiles':
                return 'delete';
            case 'renameFiles':
                return 'rename';
            default:
                return 'edit';
        }
    }

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
     * Clear all pending actions
     */
    public clearPending(): void {
        this.pendingActions.clear();
        if (this.currentBatch) {
            this.endBatch(BatchStatus.Rejected);
        }
    }

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

    /**
     * Dispose the approval engine
     */
    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
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
        // Use a type-safe way to allow instance reset for testing
        (ApprovalEngine as unknown as { instance?: ApprovalEngine }).instance = undefined;
    }
}

/**
 * Helper to get approval engine instance
 */
export function getApprovalEngine(): ApprovalEngine {
    return ApprovalEngine.getInstance();
}