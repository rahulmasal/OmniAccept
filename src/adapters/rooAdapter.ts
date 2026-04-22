import * as vscode from 'vscode';
import { ActionContext, ActionBatch, AdapterStatus, RiskLevel, ApprovalState } from '../types';
import { BaseAdapter, createAdapterStatus } from './interface';
import { getLogger } from '../logger';

interface RooCodeAPI {
    onDidCreateTask?: (callback: (task: unknown) => void) => vscode.Disposable;
    onDidCompleteTask?: (callback: (task: unknown) => void) => vscode.Disposable;
    onDidApproveAction?: (callback: (action: unknown) => void) => vscode.Disposable;
    onDidRejectAction?: (callback: (action: unknown) => void) => vscode.Disposable;
    getPendingActions?: () => Promise<unknown[]>;
    approveAction?: (actionId: string) => Promise<boolean>;
    rejectAction?: (actionId: string) => Promise<boolean>;
}

export class RooCodeAdapter extends BaseAdapter {
    readonly name = 'Roo Code';
    readonly extensionId = 'rooveterinary.roo-code';
    override readonly version = '1.0.0';

    private api: RooCodeAPI | null = null;
    private apiDisposables: vscode.Disposable[] = [];

    constructor() {
        super();
        this.checkActive();
        this.tryConnectAPI();
    }

    private tryConnectAPI(): void {
        const logger = getLogger();
        try {
            const extension = this.getExtension(this.extensionId);
            if (extension && extension.isActive && extension.exports) {
                this.api = extension.exports as RooCodeAPI;
                logger.info('Roo Code: Connected to extension API');
                this.setupAPIListeners();
            } else {
                logger.debug('Roo Code: No exports API available, using file-watcher fallback');
            }
        } catch (error) {
            logger.debug(`Roo Code: API connection failed: ${error}`);
        }
    }

    private setupAPIListeners(): void {
        if (!this.api) {
            return;
        }

        const logger = getLogger();

        if (this.api.onDidCreateTask) {
            const sub = this.api.onDidCreateTask((task) => {
                logger.debug(`Roo Code: Task created: ${JSON.stringify(task)}`);
                const action = this.createActionContextFromAPI('createFiles', 'Roo Code task created');
                this.emitAction(action);
            });
            this.apiDisposables.push(sub);
        }

        if (this.api.onDidApproveAction) {
            const sub = this.api.onDidApproveAction((action) => {
                logger.debug(`Roo Code: Action approved by user: ${JSON.stringify(action)}`);
                this.lastActivity = new Date();
            });
            this.apiDisposables.push(sub);
        }

        if (this.api.onDidRejectAction) {
            const sub = this.api.onDidRejectAction((action) => {
                logger.debug(`Roo Code: Action rejected by user: ${JSON.stringify(action)}`);
                this.lastActivity = new Date();
            });
            this.apiDisposables.push(sub);
        }
    }

    private checkActive(): void {
        const extension = this.getExtension(this.extensionId);
        this._isActive = extension !== undefined && extension.isActive;
    }

    public isActive(): boolean {
        this.checkActive();
        return this._isActive;
    }

    public isEnabled(): boolean {
        return this.isActive();
    }

    public async getPendingActions(): Promise<ActionContext[]> {
        if (!this.isActive()) {
            return [];
        }

        const logger = getLogger();
        logger.debug('Getting pending actions from Roo Code');

        if (this.api && this.api.getPendingActions) {
            try {
                const rawActions = await this.api.getPendingActions();
                if (Array.isArray(rawActions)) {
                    return rawActions.map((a: unknown) => this.createActionContextFromAPI(
                        'editFiles',
                        `Roo Code action: ${String(a)}`
                    ));
                }
            } catch (error) {
                logger.error(`Roo Code: Failed to get pending actions: ${error}`);
            }
        }

        return [];
    }

    public async approveAction(action: ActionContext): Promise<boolean> {
        const logger = getLogger();
        logger.info(`Roo Code: Approving action ${action.id}`);
        this.lastActivity = new Date();

        if (this.api && this.api.approveAction) {
            try {
                return await this.api.approveAction(action.id);
            } catch (error) {
                logger.error(`Roo Code: API approve failed: ${error}`);
            }
        }

        return true;
    }

    public async rejectAction(action: ActionContext): Promise<boolean> {
        const logger = getLogger();
        logger.info(`Roo Code: Rejecting action ${action.id}`);
        this.lastActivity = new Date();

        if (this.api && this.api.rejectAction) {
            try {
                return await this.api.rejectAction(action.id);
            } catch (error) {
                logger.error(`Roo Code: API reject failed: ${error}`);
            }
        }

        return true;
    }

    public async approveBatch(batch: ActionBatch): Promise<boolean> {
        const logger = getLogger();
        logger.info(`Roo Code: Approving batch ${batch.id} with ${batch.actions.length} actions`);

        for (const action of batch.actions) {
            await this.approveAction(action);
        }

        return true;
    }

    public async rejectBatch(batch: ActionBatch): Promise<boolean> {
        const logger = getLogger();
        logger.info(`Roo Code: Rejecting batch ${batch.id} with ${batch.actions.length} actions`);

        for (const action of batch.actions) {
            await this.rejectAction(action);
        }

        return true;
    }

    public getAdapterStatus(): AdapterStatus {
        return createAdapterStatus(
            this.name,
            this.version,
            this.isActive(),
            this.isEnabled(),
            0
        );
    }

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

    private createActionContextFromAPI(type: string, description: string): ActionContext {
        return {
            id: this.generateActionId(),
            type: type as ActionContext['type'],
            description,
            isWorkspaceFile: true,
            isSensitiveFile: false,
            adapterName: this.name,
            timestamp: new Date(),
            riskLevel: RiskLevel.Low,
            requiredApproval: ApprovalState.Ask
        };
    }

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

    private containsSensitiveFiles(files: string[]): boolean {
        const sensitivePatterns = [
            '.env', '.ssh', 'secret', 'token', 'key',
            'password', 'credential', '.pem', '.key'
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

    public override dispose(): void {
        this.apiDisposables.forEach(d => d.dispose());
        this.apiDisposables = [];
        this.api = null;
        super.dispose();
    }
}
