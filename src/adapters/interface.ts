import * as vscode from 'vscode';
import {
    ActionContext,
    ActionBatch,
    AdapterStatus,
    IAdapter
} from '../types';

/**
 * Base adapter class with common functionality
 */
export abstract class BaseAdapter implements IAdapter {
    protected _isActive = false;
    protected _isEnabled = true;
    protected lastActivity?: Date;

    abstract readonly name: string;
    abstract readonly extensionId: string;
    abstract readonly version: string;

    private actionListeners: Array<(action: ActionContext) => void> = [];
    private batchStartListeners: Array<(batch: ActionBatch) => void> = [];
    private batchEndListeners: Array<(batch: ActionBatch) => void> = [];

    abstract isActive(): boolean;
    
    abstract isEnabled(): boolean;

    abstract getPendingActions(): Promise<ActionContext[]>;

    abstract approveAction(action: ActionContext): Promise<boolean>;

    abstract rejectAction(action: ActionContext): Promise<boolean>;

    abstract approveBatch(batch: ActionBatch): Promise<boolean>;

    abstract rejectBatch(batch: ActionBatch): Promise<boolean>;

    abstract getAdapterStatus(): AdapterStatus;

    /**
     * Register a listener for action events
     */
    public onAction(callback: (action: ActionContext) => void): vscode.Disposable {
        this.actionListeners.push(callback);
        return {
            dispose: () => {
                const index = this.actionListeners.indexOf(callback);
                if (index > -1) {
                    this.actionListeners.splice(index, 1);
                }
            }
        };
    }

    /**
     * Register a listener for batch start events
     */
    public onBatchStart(callback: (batch: ActionBatch) => void): vscode.Disposable {
        this.batchStartListeners.push(callback);
        return {
            dispose: () => {
                const index = this.batchStartListeners.indexOf(callback);
                if (index > -1) {
                    this.batchStartListeners.splice(index, 1);
                }
            }
        };
    }

    /**
     * Register a listener for batch end events
     */
    public onBatchEnd(callback: (batch: ActionBatch) => void): vscode.Disposable {
        this.batchEndListeners.push(callback);
        return {
            dispose: () => {
                const index = this.batchEndListeners.indexOf(callback);
                if (index > -1) {
                    this.batchEndListeners.splice(index, 1);
                }
            }
        };
    }

    /**
     * Emit an action event to all listeners
     */
    protected emitAction(action: ActionContext): void {
        for (const listener of this.actionListeners) {
            try {
                listener(action);
            } catch (error) {
                console.error(`Error in action listener: ${error}`);
            }
        }
    }

    /**
     * Emit a batch start event to all listeners
     */
    protected emitBatchStart(batch: ActionBatch): void {
        for (const listener of this.batchStartListeners) {
            try {
                listener(batch);
            } catch (error) {
                console.error(`Error in batch start listener: ${error}`);
            }
        }
    }

    /**
     * Emit a batch end event to all listeners
     */
    protected emitBatchEnd(batch: ActionBatch): void {
        for (const listener of this.batchEndListeners) {
            try {
                listener(batch);
            } catch (error) {
                console.error(`Error in batch end listener: ${error}`);
            }
        }
    }

    /**
     * Check if the extension is installed
     */
    protected isExtensionInstalled(extensionId: string): boolean {
        const extension = vscode.extensions.getExtension(extensionId);
        return extension !== undefined;
    }

    /**
     * Get the extension if installed and active
     */
    protected getExtension(extensionId: string): vscode.Extension<unknown> | undefined {
        return vscode.extensions.getExtension(extensionId);
    }

    /**
     * Generate a unique action ID
     */
    protected generateActionId(): string {
        return `${this.name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Dispose the adapter
     */
    public dispose(): void {
        this.actionListeners = [];
        this.batchStartListeners = [];
        this.batchEndListeners = [];
    }
}

/**
 * Create a basic adapter status object
 */
export function createAdapterStatus(
    name: string,
    version: string,
    isActive: boolean,
    isEnabled: boolean,
    pendingActionsCount: number
): AdapterStatus {
    return {
        isActive,
        isEnabled,
        name,
        version,
        pendingActionsCount,
        lastActivity: isActive ? new Date() : undefined
    };
}