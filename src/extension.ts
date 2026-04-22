import * as vscode from 'vscode';
import { getLogger, Logger } from './logger';
import { getSettings, Settings } from './settings';
import { getApprovalEngine, ApprovalEngine } from './approvalEngine';
import { getAdapterRegistry, AdapterRegistry } from './adapterRegistry';
import { getCommands, Commands } from './commands';

/**
 * Extension mode for status bar
 */
type ExtensionMode = 'on' | 'ask' | 'off';

/**
 * Status bar manager for the extension
 */
class StatusBarManager implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];
    private currentMode: ExtensionMode = 'on';
    private currentAdapter: string = '';

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            'universalAutoAccept.statusBar',
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'universalAutoAccept.toggleEnabled';
        this.updateDisplay();

        // Update on settings change
        const settings = getSettings();
        settings.onDidChange(() => {
            this.updateFromSettings();
        });
    }

    /**
     * Update status bar from settings
     */
    public updateFromSettings(): void {
        const settings = getSettings();
        this.currentMode = settings.statusBarMode;

        const registry = getAdapterRegistry();
        const adapter = registry.getActiveAdapter();
        this.currentAdapter = adapter?.name || 'None';

        this.updateDisplay();
    }

    /**
     * Update the status bar display
     */
    public updateDisplay(): void {
        const settings = getSettings();

        // Get mode from settings
        this.currentMode = settings.statusBarMode;

        // Get adapter name
        const registry = getAdapterRegistry();
        const adapter = registry.getActiveAdapter();
        this.currentAdapter = adapter?.name || 'None';

        // Build status text
        let text: string;
        let tooltip: string;
        let color: string | undefined;

        switch (this.currentMode) {
            case 'on':
                text = `$(check) Auto: ${this.currentAdapter}`;
                tooltip = `Universal Auto Accept: ON\nAdapter: ${this.currentAdapter}\nClick to toggle`;
                color = '#2ea043'; // Green
                break;
            case 'ask':
                text = `$(question) Auto: ASK`;
                tooltip = `Universal Auto Accept: ASK\nAdapter: ${this.currentAdapter}\nClick to toggle`;
                color = '#d29922'; // Yellow/Orange
                break;
            case 'off':
            default:
                text = `$(x) Auto: OFF`;
                tooltip = `Universal Auto Accept: OFF\nClick to enable`;
                color = '#f85149'; // Red
                break;
        }

        this.statusBarItem.text = text;
        this.statusBarItem.tooltip = new vscode.MarkdownString(tooltip);
        this.statusBarItem.color = color;
        this.statusBarItem.show();
    }

    /**
     * Set the mode
     */
    public async setMode(mode: ExtensionMode): Promise<void> {
        this.currentMode = mode;
        const settings = getSettings();
        await settings.setStatusBarMode(mode);
        this.updateDisplay();
    }

    /**
     * Get current mode
     */
    public getMode(): ExtensionMode {
        return this.currentMode;
    }

    /**
     * Cycle through modes
     */
    public async cycleMode(): Promise<void> {
        const modes: ExtensionMode[] = ['on', 'ask', 'off'];
        const currentIndex = modes.indexOf(this.currentMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        await this.setMode(modes[nextIndex]);
    }

    /**
     * Show pending action count
     */
    public showPendingCount(count: number): void {
        if (count > 0) {
            this.statusBarItem.text = `$(primitive-square) ${count} pending`;
            this.statusBarItem.command = 'universalAutoAccept.showDiffPreview';
        } else {
            this.updateDisplay();
        }
    }

    /**
     * Dispose the status bar
     */
    public dispose(): void {
        this.statusBarItem.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}

/**
 * Extension context manager
 */
class ExtensionContextManager {
    private context: vscode.ExtensionContext | null = null;
    private logger: Logger | null = null;
    private settings: Settings | null = null;
    private approvalEngine: ApprovalEngine | null = null;
    private adapterRegistry: AdapterRegistry | null = null;
    private commands: Commands | null = null;
    private statusBarManager: StatusBarManager | null = null;

    /**
     * Initialize the extension
     */
    public async initialize(context: vscode.ExtensionContext): Promise<void> {
        this.context = context;

        // Initialize logger first
        this.logger = getLogger();
        this.logger.section('Universal Auto Accept Extension');
        this.logger.info('Initializing extension...');

        try {
            // Initialize settings
            this.settings = getSettings();
            this.logger.setLogLevel(this.settings.logLevel);
            this.logger.info(`Log level: ${this.settings.logLevel}`);

            // Initialize approval engine
            this.approvalEngine = getApprovalEngine();
            this.logger.info('Approval engine initialized');

            // Initialize adapter registry
            this.adapterRegistry = getAdapterRegistry();
            await this.adapterRegistry.initialize();
            this.logger.info('Adapter registry initialized');

            // Initialize commands
            this.commands = getCommands();
            this.logger.info('Commands initialized');

            // Initialize status bar
            this.statusBarManager = new StatusBarManager();
            this.statusBarManager.updateFromSettings();
            this.logger.info('Status bar initialized');

            // Setup event handlers
            this.setupEventHandlers();

            // Update context flags for command visibility
            this.updateContextFlags();

            this.logger.info('Extension initialization complete');
        } catch (error) {
            this.logger?.error(`Initialization failed: ${error}`);
            throw error;
        }
    }

    /**
     * Setup event handlers
     */
    private setupEventHandlers(): void {
        if (!this.approvalEngine || !this.statusBarManager) {
            return;
        }

        // Handle action events
        this.approvalEngine.onAction((action) => {
            this.logger?.debug(`Action received: ${action.type}`);
        });

        // Handle approval events
        this.approvalEngine.onApproval((action) => {
            this.logger?.info(`Action approved: ${action.id}`);
            this.updateContextFlags();
        });

        // Handle rejection events
        this.approvalEngine.onRejection((action) => {
            this.logger?.info(`Action rejected: ${action.id}`);
            this.updateContextFlags();
        });

        // Handle batch events
        this.approvalEngine.onBatch((batch) => {
            this.logger?.info(`Batch ${batch.status}: ${batch.id}`);
            this.updateContextFlags();
        });

        // Handle adapter changes
        if (this.adapterRegistry) {
            this.adapterRegistry.onActiveAdapterChange((adapter) => {
                this.logger?.info(`Active adapter changed: ${adapter?.name || 'none'}`);
                this.statusBarManager?.updateDisplay();
                this.updateContextFlags();
            });
        }

        // Handle settings changes
        if (this.settings) {
            this.settings.onDidChange((settings) => {
                this.logger?.setLogLevel(settings.logLevel);
                this.statusBarManager?.updateFromSettings();
                this.updateContextFlags();
            });
        }
    }

    /**
     * Update VS Code context flags for command visibility
     */
    private updateContextFlags(): void {
        if (!this.context) {
            return;
        }

        const commands = getCommands();
        const visibility = commands.getCommandVisibility();

        // These context keys can be used in when clauses
        vscode.commands.executeCommand('setContext', 'universalAutoAccept:isActive', visibility.isActive);
        vscode.commands.executeCommand('setContext', 'universalAutoAccept:hasPendingActions', visibility.hasPendingActions);
        vscode.commands.executeCommand('setContext', 'universalAutoAccept:hasUndoHistory', visibility.hasUndoHistory);
    }

    /**
     * Get the status bar manager
     */
    public getStatusBarManager(): StatusBarManager | null {
        return this.statusBarManager;
    }

    /**
     * Cleanup resources
     */
    public dispose(): void {
        this.logger?.info('Disposing extension...');

        this.statusBarManager?.dispose();
        this.commands?.dispose();
        this.adapterRegistry?.dispose();
        this.approvalEngine?.dispose();
        this.settings?.dispose();
        this.logger?.dispose();

        this.context = null;
        this.logger = null;
        this.settings = null;
        this.approvalEngine = null;
        this.adapterRegistry = null;
        this.commands = null;
        this.statusBarManager = null;
    }
}

// Global context manager
let contextManager: ExtensionContextManager | null = null;

/**
 * Called when the extension is activated
 */
export function activate(context: vscode.ExtensionContext): void {
    // Setup global exception handler
    process.on('uncaughtException', (error) => {
        console.error('Uncaught exception:', error);
    });

    // Create and initialize context manager
    contextManager = new ExtensionContextManager();
    
    contextManager.initialize(context).catch((error) => {
        console.error('Failed to initialize extension:', error);
        vscode.window.showErrorMessage(`Universal Auto Accept failed to initialize: ${error}`);
    });

    // Register deactivation handler
    context.subscriptions.push({
        dispose: () => {
            contextManager?.dispose();
        }
    });
}

/**
 * Called when the extension is deactivated
 */
export function deactivate(): void {
    contextManager?.dispose();
    contextManager = null;
}