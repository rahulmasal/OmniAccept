import * as vscode from 'vscode';
import { getLogger } from './logger';
import { getSettings } from './settings';
import { getApprovalEngine } from './approvalEngine';
import { getAdapterRegistry } from './adapterRegistry';
import { showDiffPreview } from './diffPreview';

/**
 * Command handlers for the extension
 */
export class Commands implements vscode.Disposable {
    private static instance: Commands;
    private disposables: vscode.Disposable[] = [];

    private constructor() {
        this.registerAll();
    }

    public static getInstance(): Commands {
        if (!Commands.instance) {
            Commands.instance = new Commands();
        }
        return Commands.instance;
    }

    /**
     * Register all commands
     */
    private registerAll(): void {
        const logger = getLogger();

        // Toggle enabled
        this.disposables.push(
            vscode.commands.registerCommand('universalAutoAccept.toggleEnabled', async () => {
                await this.toggleEnabled();
            })
        );

        // Open settings
        this.disposables.push(
            vscode.commands.registerCommand('universalAutoAccept.openSettings', async () => {
                await this.openSettings();
            })
        );

        // Approve current batch
        this.disposables.push(
            vscode.commands.registerCommand('universalAutoAccept.approveCurrentBatch', async () => {
                await this.approveCurrentBatch();
            })
        );

        // Reject current batch
        this.disposables.push(
            vscode.commands.registerCommand('universalAutoAccept.rejectCurrentBatch', async () => {
                await this.rejectCurrentBatch();
            })
        );

        // Show active adapter
        this.disposables.push(
            vscode.commands.registerCommand('universalAutoAccept.showActiveAdapter', async () => {
                await this.showActiveAdapter();
            })
        );

        // Rescan adapters
        this.disposables.push(
            vscode.commands.registerCommand('universalAutoAccept.rescanAdapters', async () => {
                await this.rescanAdapters();
            })
        );

        // Undo last batch
        this.disposables.push(
            vscode.commands.registerCommand('universalAutoAccept.undoLastBatch', async () => {
                await this.undoLastBatch();
            })
        );

        // Show diff preview
        this.disposables.push(
            vscode.commands.registerCommand('universalAutoAccept.showDiffPreview', async () => {
                this.showDiffPreviewInternal();
            })
        );

        logger.info('All commands registered');
    }

    /**
     * Toggle extension enabled state
     */
    public async toggleEnabled(): Promise<void> {
        const logger = getLogger();
        const settings = getSettings();

        const newState = !settings.enabled;
        await settings.setEnabled(newState);

        logger.info(`Extension ${newState ? 'enabled' : 'disabled'}`);

        vscode.window.showInformationMessage(
            `Universal Auto Accept is now ${newState ? 'ON' : 'OFF'}`,
            'Open Settings'
        ).then((choice) => {
            if (choice === 'Open Settings') {
                this.openSettings();
            }
        });
    }

    /**
     * Open extension settings
     */
    public async openSettings(): Promise<void> {
        await vscode.commands.executeCommand(
            'workbench.action.openSettings',
            'universalAutoAccept'
        );
    }

    /**
     * Approve all pending actions in the current batch
     */
    public async approveCurrentBatch(): Promise<boolean> {
        const logger = getLogger();
        const approvalEngine = getApprovalEngine();

        if (!approvalEngine.hasPendingActions()) {
            vscode.window.showInformationMessage('No pending actions to approve');
            return false;
        }

        const batch = approvalEngine.getCurrentBatch();
        if (!batch) {
            vscode.window.showInformationMessage('No current batch to approve');
            return false;
        }

        const result = await vscode.window.showInformationMessage(
            `Approve ${batch.actions.length} action(s)?`,
            'Approve', 'Cancel'
        );

        if (result === 'Approve') {
            const success = await approvalEngine.approveCurrentBatch();
            if (success) {
                logger.info('Batch approved by user');
                vscode.window.showInformationMessage('All pending actions approved');
            }
            return success;
        }

        return false;
    }

    /**
     * Reject all pending actions in the current batch
     */
    public async rejectCurrentBatch(): Promise<boolean> {
        const logger = getLogger();
        const approvalEngine = getApprovalEngine();

        if (!approvalEngine.hasPendingActions()) {
            vscode.window.showInformationMessage('No pending actions to reject');
            return false;
        }

        const batch = approvalEngine.getCurrentBatch();
        if (!batch) {
            vscode.window.showInformationMessage('No current batch to reject');
            return false;
        }

        const result = await vscode.window.showInformationMessage(
            `Reject ${batch.actions.length} action(s)?`,
            'Reject', 'Cancel'
        );

        if (result === 'Reject') {
            const success = await approvalEngine.rejectCurrentBatch();
            if (success) {
                logger.info('Batch rejected by user');
                vscode.window.showInformationMessage('All pending actions rejected');
            }
            return success;
        }

        return false;
    }

    /**
     * Show information about the active adapter
     */
    public async showActiveAdapter(): Promise<void> {
        const registry = getAdapterRegistry();
        const activeAdapter = registry.getActiveAdapter();

        if (!activeAdapter) {
            vscode.window.showInformationMessage('No active AI coding extension detected');
            return;
        }

        const status = activeAdapter.getAdapterStatus();
        const message = `
Adapter: ${status.name}
Version: ${status.version}
Status: ${status.isActive ? 'Active' : 'Inactive'}
Enabled: ${status.isEnabled ? 'Yes' : 'No'}
Pending Actions: ${status.pendingActionsCount}
Last Activity: ${status.lastActivity?.toLocaleTimeString() ?? 'N/A'}
        `.trim();

        await vscode.window.showInformationMessage(message, 'Open Settings');
    }

    /**
     * Rescan for compatible AI coding extensions
     */
    public async rescanAdapters(): Promise<void> {
        const logger = getLogger();
        const registry = getAdapterRegistry();

        logger.info('Rescanning adapters...');

        await registry.rescanAdapters();

        const summary = registry.getStatusSummary();
        
        let message = `Found ${summary.totalAdapters} adapter(s)`;
        if (summary.activeAdapterName) {
            message += `\nActive: ${summary.activeAdapterName}`;
        }
        if (summary.installedExtensions.length > 0) {
            message += `\nExtensions: ${summary.installedExtensions.join(', ')}`;
        }

        vscode.window.showInformationMessage(message);
    }

    /**
     * Undo the last approved batch
     */
    public async undoLastBatch(): Promise<boolean> {
        const logger = getLogger();
        const approvalEngine = getApprovalEngine();

        if (!approvalEngine.hasUndoHistory()) {
            vscode.window.showInformationMessage('No actions to undo');
            return false;
        }

        const history = approvalEngine.getUndoHistory();
        const lastEntry = history[history.length - 1];

        const result = await vscode.window.showInformationMessage(
            `Undo ${lastEntry.changes.length} change(s) from batch ${lastEntry.batchId}?`,
            'Undo', 'Cancel'
        );

        if (result === 'Undo') {
            const success = await approvalEngine.undoLastBatch();
            if (success) {
                logger.info('Last batch undone by user');
                vscode.window.showInformationMessage('Last batch changes reverted');
            }
            return success;
        }

        return false;
    }

    /**
     * Show diff preview (internal)
     */
    private showDiffPreviewInternal(): void {
        const approvalEngine = getApprovalEngine();
        
        if (!approvalEngine.hasPendingActions()) {
            vscode.window.showInformationMessage('No pending actions to preview');
            return;
        }

        showDiffPreview();
    }

    /**
     * Get command visibility state
     */
    public getCommandVisibility(): {
        hasPendingActions: boolean;
        hasUndoHistory: boolean;
        isActive: boolean;
    } {
        const approvalEngine = getApprovalEngine();
        const settings = getSettings();

        return {
            hasPendingActions: approvalEngine.hasPendingActions(),
            hasUndoHistory: approvalEngine.hasUndoHistory(),
            isActive: settings.enabled
        };
    }

    /**
     * Dispose command handlers
     */
    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        // Use a type-safe way to allow instance reset for testing
        (Commands as unknown as { instance?: Commands }).instance = undefined;
    }
}

/**
 * Helper to get commands instance
 */
export function getCommands(): Commands {
    return Commands.getInstance();
}