import * as vscode from 'vscode';
import { ActionContext, ActionBatch, AdapterStatus, RiskLevel, ApprovalState } from '../types';
import { BaseAdapter, createAdapterStatus } from './interface';
import { getLogger } from '../logger';

/**
 * Adapter for Kilo Code extension
 * Kilo Code is an AI coding assistant by Kilo Code that provides autonomous coding capabilities
 */
export class KiloCodeAdapter extends BaseAdapter {
    readonly name = 'Kilo Code';
    readonly extensionId = 'kilocode.kilo-code';
    override readonly version = '1.0.0';

    constructor() {
        super();
        this.checkActive();
    }

    /**
     * Check if the Kilo Code extension is active
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
        return this.isActive();
    }

    /**
     * Get pending actions from Kilo Code
     */
    public async getPendingActions(): Promise<ActionContext[]> {
        if (!this.isActive()) {
            return [];
        }

        const logger = getLogger();
        logger.debug('Getting pending actions from Kilo Code');

        // Similar to Roo Code adapter, this would need to communicate
        // with Kilo Code's internal system. Since VS Code doesn't
        // expose public APIs for this, we implement best-effort approach.

        return [];
    }

    /**
     * Approve a specific action
     */
    public async approveAction(action: ActionContext): Promise<boolean> {
        const logger = getLogger();
        logger.info(`Kilo Code: Approving action ${action.id}`);

        this.lastActivity = new Date();
        return true;
    }

    /**
     * Reject a specific action
     */
    public async rejectAction(action: ActionContext): Promise<boolean> {
        const logger = getLogger();
        logger.info(`Kilo Code: Rejecting action ${action.id}`);

        this.lastActivity = new Date();
        return true;
    }

    /**
     * Approve all actions in a batch
     */
    public async approveBatch(batch: ActionBatch): Promise<boolean> {
        const logger = getLogger();
        logger.info(`Kilo Code: Approving batch ${batch.id} with ${batch.actions.length} actions`);

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
        logger.info(`Kilo Code: Rejecting batch ${batch.id} with ${batch.actions.length} actions`);

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
            0
        );
    }

    /**
     * Create an action context for Kilo Code events
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