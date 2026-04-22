import * as vscode from 'vscode';
import { IAdapter, ActionContext, AdapterStatus } from './types';
import { getLogger } from './logger';
import { getSettings } from './settings';

/**
 * Registry for managing adapter instances
 */
export class AdapterRegistry implements vscode.Disposable {
    private static instance: AdapterRegistry;
    private adapters: Map<string, IAdapter> = new Map();
    private activeAdapter: IAdapter | null = null;
    private disposables: vscode.Disposable[] = [];

    private adapterChangeEmitter: vscode.EventEmitter<IAdapter | null>;
    private actionEmitter: vscode.EventEmitter<ActionContext>;

    // Known AI coding extension IDs
    private readonly knownExtensions = [
        'rooveterinary.roo-code',
        'kilocode.kilo-code',
        'anthropic.anthropic-code',
        'github.copilot',
        'aws.amazon-q',
        'continue.continue'
    ];

    private constructor() {
        this.adapterChangeEmitter = new vscode.EventEmitter<IAdapter | null>();
        this.actionEmitter = new vscode.EventEmitter<ActionContext>();

        // Listen for extension changes
        this.disposables.push(
            vscode.extensions.onDidChange(() => {
                getLogger().info('Extensions changed, rescanning adapters');
                this.rescanAdapters();
            })
        );
    }

    public static getInstance(): AdapterRegistry {
        if (!AdapterRegistry.instance) {
            AdapterRegistry.instance = new AdapterRegistry();
        }
        return AdapterRegistry.instance;
    }

    /**
     * Initialize the registry and scan for adapters
     */
    public async initialize(): Promise<void> {
        const logger = getLogger();
        logger.section('Adapter Registry Initialization');

        await this.scanForAdapters();
        this.selectActiveAdapter();

        logger.info(`Found ${this.adapters.size} adapters`);
        this.logAdapterStatus();
    }

    /**
     * Scan for installed AI coding extensions
     */
    public async scanForAdapters(): Promise<void> {
        const logger = getLogger();
        logger.info('Scanning for compatible extensions...');

        // Clear existing adapters
        this.disposeAdapters();

        const settings = getSettings();
        const { RooCodeAdapter } = await import('./adapters/rooAdapter.js');
        const { KiloCodeAdapter } = await import('./adapters/kiloAdapter.js');
        const { GenericAdapter } = await import('./adapters/genericAdapter.js');

        // Check for Roo Code
        const adapterSettings = settings.settings.adapterSettings;
        if (adapterSettings.rooCode) {
            const rooAdapter = new RooCodeAdapter();
            if (rooAdapter.isActive()) {
                this.registerAdapter(rooAdapter);
                logger.info('Roo Code adapter registered');
            }
        }

        // Check for Kilo Code
        if (adapterSettings.kiloCode) {
            const kiloAdapter = new KiloCodeAdapter();
            if (kiloAdapter.isActive()) {
                this.registerAdapter(kiloAdapter);
                logger.info('Kilo Code adapter registered');
            }
        }

        // Check for other known extensions
        for (const extId of this.knownExtensions) {
            if (!this.hasAdapterForExtension(extId)) {
                const genericAdapter = new GenericAdapter(extId);
                if (genericAdapter.isActive()) {
                    this.registerAdapter(genericAdapter);
                    logger.info(`Generic adapter registered for: ${extId}`);
                }
            }
        }

        // If no specific adapter found, use generic
        if (this.adapters.size === 0) {
            const genericAdapter = new GenericAdapter('generic');
            this.registerAdapter(genericAdapter);
            logger.info('Generic fallback adapter registered');
        }
    }

    /**
     * Register an adapter
     */
    public registerAdapter(adapter: IAdapter): void {
        this.adapters.set(adapter.name, adapter);

        // Wire up events
        adapter.onAction((action) => {
            this.actionEmitter.fire(action);
        });

        getLogger().debug(`Adapter registered: ${adapter.name}`);
    }

    /**
     * Unregister an adapter
     */
    public unregisterAdapter(name: string): void {
        const adapter = this.adapters.get(name);
        if (adapter) {
            adapter.dispose();
            this.adapters.delete(name);
            getLogger().debug(`Adapter unregistered: ${name}`);
        }
    }

    /**
     * Check if we have an adapter for a specific extension
     */
    public hasAdapterForExtension(extensionId: string): boolean {
        for (const adapter of this.adapters.values()) {
            if (adapter.extensionId === extensionId) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get an adapter by name
     */
    public getAdapter(name: string): IAdapter | undefined {
        return this.adapters.get(name);
    }

    /**
     * Get all registered adapters
     */
    public getAllAdapters(): IAdapter[] {
        return Array.from(this.adapters.values());
    }

    /**
     * Get all active adapters
     */
    public getActiveAdapters(): IAdapter[] {
        return this.getAllAdapters().filter(a => a.isActive() && a.isEnabled());
    }

    /**
     * Select the active adapter based on installed extensions
     */
    public selectActiveAdapter(): void {
        const logger = getLogger();

        // Priority order: Roo Code > Kilo Code > Generic
        const priority = ['Roo Code', 'Kilo Code', 'Generic'];

        for (const name of priority) {
            const adapter = this.adapters.get(name);
            if (adapter && adapter.isActive() && adapter.isEnabled()) {
                this.activeAdapter = adapter;
                this.adapterChangeEmitter.fire(adapter);
                logger.info(`Active adapter selected: ${name}`);
                return;
            }
        }

        // No active adapter found
        this.activeAdapter = null;
        this.adapterChangeEmitter.fire(null);
        logger.warn('No active adapter available');
    }

    /**
     * Manually set the active adapter
     */
    public setActiveAdapter(name: string): boolean {
        const adapter = this.adapters.get(name);
        if (adapter && adapter.isActive()) {
            this.activeAdapter = adapter;
            this.adapterChangeEmitter.fire(adapter);
            getLogger().info(`Active adapter manually set to: ${name}`);
            return true;
        }
        return false;
    }

    /**
     * Get the current active adapter
     */
    public getActiveAdapter(): IAdapter | null {
        return this.activeAdapter;
    }

    /**
     * Get status of all adapters
     */
    public getAllAdapterStatus(): AdapterStatus[] {
        return this.getAllAdapters().map(adapter => adapter.getAdapterStatus());
    }

    /**
     * Rescan and refresh all adapters
     */
    public async rescanAdapters(): Promise<void> {
        const logger = getLogger();
        logger.info('Rescanning adapters...');

        await this.scanForAdapters();
        this.selectActiveAdapter();
    }

    /**
     * Check if a specific extension is installed
     */
    public isExtensionInstalled(extensionId: string): boolean {
        return vscode.extensions.getExtension(extensionId) !== undefined;
    }

    /**
     * Get all compatible AI coding extensions
     */
    public getCompatibleExtensions(): vscode.Extension<unknown>[] {
        const extensions: vscode.Extension<unknown>[] = [];

        for (const extId of this.knownExtensions) {
            const ext = vscode.extensions.getExtension(extId);
            if (ext) {
                extensions.push(ext);
            }
        }

        return extensions;
    }

    /**
     * Get status information for all adapters
     */
    public getStatusSummary(): {
        totalAdapters: number;
        activeAdapters: number;
        activeAdapterName: string | null;
        installedExtensions: string[];
    } {
        const extensions = this.getCompatibleExtensions();

        return {
            totalAdapters: this.adapters.size,
            activeAdapters: this.getActiveAdapters().length,
            activeAdapterName: this.activeAdapter?.name ?? null,
            installedExtensions: extensions.map(e => e.id)
        };
    }

    /**
     * Log current adapter status
     */
    private logAdapterStatus(): void {
        const logger = getLogger();
        const status = this.getStatusSummary();

        logger.info(`Total adapters: ${status.totalAdapters}`);
        logger.info(`Active adapters: ${status.activeAdapters}`);
        logger.info(`Active adapter: ${status.activeAdapterName ?? 'none'}`);
        logger.info(`Installed extensions: ${status.installedExtensions.join(', ') || 'none'}`);
    }

    /**
     * Dispose all adapters and clean up
     */
    private disposeAdapters(): void {
        for (const adapter of this.adapters.values()) {
            adapter.dispose();
        }
        this.adapters.clear();
    }

    /**
     * Event: when the active adapter changes
     */
    public get onActiveAdapterChange(): vscode.Event<IAdapter | null> {
        return this.adapterChangeEmitter.event;
    }

    /**
     * Event: when an action is received from any adapter
     */
    public get onAction(): vscode.Event<ActionContext> {
        return this.actionEmitter.event;
    }

    /**
     * Dispose the registry
     */
    public dispose(): void {
        this.disposeAdapters();
        this.adapterChangeEmitter.dispose();
        this.actionEmitter.dispose();
        this.disposables.forEach(d => d.dispose());
        (AdapterRegistry as unknown as { instance?: AdapterRegistry }).instance = undefined;
    }
}

/**
 * Helper to get registry instance
 */
export function getAdapterRegistry(): AdapterRegistry {
    return AdapterRegistry.getInstance();
}