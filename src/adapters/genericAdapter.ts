import * as vscode from 'vscode';
import { ActionContext, ActionBatch, AdapterStatus, RiskLevel, ApprovalState, ActionType } from '../types';
import { BaseAdapter, createAdapterStatus } from './interface';
import { getLogger } from '../logger';

/**
 * Generic adapter for unknown or unsupported AI coding extensions
 * Provides a fallback mechanism for detecting file system changes
 */
export class GenericAdapter extends BaseAdapter {
    readonly name: string;
    readonly extensionId: string;
    readonly version = '1.0.0';

    private fileWatcher: vscode.FileSystemWatcher | null = null;
    private pendingChanges: Map<string, ActionContext> = new Map();

    constructor(extensionId: string = 'generic') {
        super();
        this.extensionId = extensionId;
        this.name = extensionId === 'generic' ? 'Generic' : this.formatExtensionName(extensionId);
        this.setupFileWatcher();
    }

    /**
     * Format extension ID into a readable name
     */
    private formatExtensionName(extensionId: string): string {
        const parts = extensionId.split('.');
        if (parts.length >= 2) {
            const name = parts[parts.length - 1];
            return name
                .split('-')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }
        return extensionId;
    }

    /**
     * Setup file system watcher for detecting changes
     */
    private setupFileWatcher(): void {
        const logger = getLogger();

        try {
            // Watch all files in workspace for changes
            this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');

            this.fileWatcher.onDidChange((uri) => {
                logger.debug(`Generic: File changed - ${uri.fsPath}`);
                this.handleFileChange(uri, 'change');
            });

            this.fileWatcher.onDidCreate((uri) => {
                logger.debug(`Generic: File created - ${uri.fsPath}`);
                this.handleFileChange(uri, 'create');
            });

            this.fileWatcher.onDidDelete((uri) => {
                logger.debug(`Generic: File deleted - ${uri.fsPath}`);
                this.handleFileChange(uri, 'delete');
            });

            logger.debug('Generic adapter file watcher initialized');
        } catch (error) {
            logger.error(`Failed to setup file watcher: ${error}`);
        }
    }

    /**
     * Handle file system change events
     */
    private handleFileChange(uri: vscode.Uri, changeType: 'create' | 'change' | 'delete'): void {
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
            case 'create':
                actionType = ActionType.CreateFiles;
                break;
            case 'delete':
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
            requiredApproval: ApprovalState.Ask
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
            const folderPath = folder.uri.fsPath.replace(/\\/g, '/').toLowerCase();
            const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
            
            if (normalizedPath.startsWith(folderPath + '/') || normalizedPath === folderPath) {
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
            'node_modules',
            '.git',
            '.vscode',
            '.idea',
            '__pycache__',
            '.cache',
            '.tmp',
            '.log',
            '.lock'
        ];

        const lowerPath = filePath.toLowerCase();
        return ignoredPatterns.some(pattern => lowerPath.includes('/' + pattern + '/') || lowerPath.endsWith('/' + pattern));
    }

    /**
     * Check if file is sensitive
     */
    private isSensitiveFile(filePath: string): boolean {
        const sensitivePatterns = [
            '.env',
            '.ssh',
            'secret',
            'token',
            'key',
            'password',
            'credential',
            '.pem',
            '.key',
            'secrets'
        ];

        const lowerPath = filePath.toLowerCase();
        return sensitivePatterns.some(pattern => lowerPath.includes(pattern));
    }

    /**
     * Get description for action type
     */
    private getActionDescription(type: ActionType, filePath: string): string {
        const fileName = filePath.split('/').pop() || filePath;
        
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
     * Check if the adapter is currently active
     */
    public isActive(): boolean {
        return this._isActive;
    }

    /**
     * Check if the adapter is enabled
     */
    public isEnabled(): boolean {
        return this._isActive && this.fileWatcher !== null;
    }

    /**
     * Get pending actions from file watcher
     */
    public async getPendingActions(): Promise<ActionContext[]> {
        return Array.from(this.pendingChanges.values());
    }

    /**
     * Clear a pending change
     */
    private clearPendingChange(filePath: string): void {
        this.pendingChanges.delete(filePath);
    }

    /**
     * Approve a specific action
     */
    public async approveAction(action: ActionContext): Promise<boolean> {
        const logger = getLogger();
        logger.info(`Generic: Approving action ${action.id}`);

        if (action.files) {
            for (const file of action.files) {
                this.clearPendingChange(file);
            }
        }

        return true;
    }

    /**
     * Reject a specific action
     */
    public async rejectAction(action: ActionContext): Promise<boolean> {
        const logger = getLogger();
        logger.info(`Generic: Rejecting action ${action.id}`);

        // For file operations, we can't easily undo changes made by other extensions
        // This is a known limitation of VS Code's public API
        logger.warn('Generic: Rejection may not fully undo changes made by other extensions');

        if (action.files) {
            for (const file of action.files) {
                this.clearPendingChange(file);
            }
        }

        return true;
    }

    /**
     * Approve all actions in a batch
     */
    public async approveBatch(batch: ActionBatch): Promise<boolean> {
        const logger = getLogger();
        logger.info(`Generic: Approving batch ${batch.id}`);

        for (const action of batch.actions) {
            await this.approveAction(action);
        }

        return true;
    }

    /**
     * Reject all actions in a batch
     */
    public async rejectBatch(batch: ActionBatch): Promise<boolean> {
        const logger = getLogger();
        logger.info(`Generic: Rejecting batch ${batch.id}`);

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
            this.pendingChanges.size
        );
    }

    /**
     * Dispose the adapter and clean up
     */
    public dispose(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = null;
        }
        this.pendingChanges.clear();
        super.dispose();
    }
}