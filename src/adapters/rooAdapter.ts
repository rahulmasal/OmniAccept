import * as vscode from 'vscode';
import { ActionContext, ActionBatch, AdapterStatus, RiskLevel, ApprovalState } from '../types';
import { BaseAdapter, createAdapterStatus } from './interface';
import { getLogger } from '../logger';

/**
 * Adapter for Roo Code extension
 * Roo Code is an AI coding assistant that provides autonomous coding capabilities
 */
export class RooCodeAdapter extends BaseAdapter {
    readonly name = 'Roo Code';
    readonly extensionId = 'rooveterinary.roo-code';
    override readonly version = '1.0.0';

    constructor() {
        super();
        this.checkActive();
    }

    /**
     * Check if the Roo Code extension is active
     */
    private checkActive(): void {
        const extension = this.getExtension(this.extensionId);
        this._isActive = extension !== undefined && extension.isActive;
    }

    /**
     * Check if the adapter is currently active
     */
    public isActive(): boolean {
        this.checkActive();
        return this._isActive;
    }

    /**
     * Check if the adapter is enabled in settings
     */
    public isEnabled(): boolean {
        // In a real implementation, this would check settings
        // For now, just check if extension is active
        return this.isActive();
    }

    /**
     * Get pending actions from Roo Code
     */
    public async getPendingActions(): Promise<ActionContext[]> {
        if (!this.isActive()) {
            return [];
        }

        const logger = getLogger();
        logger.debug('Getting pending actions from Roo Code');

        // In a real implementation, this would communicate with the Roo Code extension
        // via its API or through workspace events. Since VS Code doesn't expose
        // a public API for this, we implement a best-effort approach using
        // file system watching and workspace events.

        // For now, return empty array - real implementation would
        // hook into Roo Code's internal event system
        return [];
    }

    /**
     * Approve a specific action
     */
    public async approveAction(action: ActionContext): Promise<boolean> {
        const logger = getLogger();
        logger.info(`Roo Code: Approving action ${action.id}`);

        this.lastActivity = new Date();

        // In a real implementation, this would send approval back to Roo Code
        // Since VS Code doesn't have a public API for this, we rely on
        // the extension's built-in approval system or configuration

        return true;
    }

    /**
     * Reject a specific action
     */
    public async rejectAction(action: ActionContext): Promise<boolean> {
        const logger = getLogger();
        logger.info(`Roo Code: Rejecting action ${action.id}`);

        this.lastActivity = new Date();

        // In a real implementation, this would send rejection back to Roo Code
        return true;
    }

    /**
     * Approve all actions in a batch
     */
    public async approveBatch(batch: ActionBatch): Promise<boolean> {
        const logger = getLogger();
        logger.info(`Roo Code: Approving batch ${batch.id} with ${batch.actions.length} actions`);

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
        logger.info(`Roo Code: Rejecting batch ${batch.id} with ${batch.actions.length} actions`);

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
            0 // Pending actions count would be retrieved from Roo Code
        );
    }

    /**
     * Create an action context for Roo Code events
     */
    public createActionContext(
        type: string,
        description: string,
        files?: string[]
    ): ActionContext {
        return {
            id: this.generateActionId(),
            type: type as ActionContext['type'],
            description,
            files,
            isWorkspaceFile: files ? files.every(f => this.isPathInWorkspace(f)) : false,
            isSensitiveFile: files ? this.containsSensitiveFiles(files) : false,
            adapterName: this.name,
            timestamp: new Date(),
            riskLevel: RiskLevel.Low,
            requiredApproval: ApprovalState.Ask
        };
    }

    /**
     * Check if a path is in the workspace
     */
    private isPathInWorkspace(filePath: string): boolean {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return false;
        }

        for (const folder of workspaceFolders) {
            const folderPath = folder.uri.fsPath.replace(/\\/g, '/').toLowerCase();
            const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
            
            if (normalizedPath.startsWith(folderPath)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if files contain sensitive content
     */
    private containsSensitiveFiles(files: string[]): boolean {
        const sensitivePatterns = [
            '.env',
            '.ssh',
            'secret',
            'token',
            'key',
            'password',
            'credential',
            '.pem',
            '.key'
        ];

        for (const file of files) {
            const lowerFile = file.toLowerCase();
            for (const pattern of sensitivePatterns) {
                if (lowerFile.includes(pattern)) {
                    return true;
                }
            }
        }

        return false;
    }
}