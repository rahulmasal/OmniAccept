import * as vscode from "vscode";
import { IAdapter, ActionContext } from "./types";
import { getLogger } from "./logger";
import { getSettings } from "./settings";

/**
 * Registry for managing adapter instances
 * Enhanced with Cline and Continue adapters (Enhancement 15)
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
    "rooveterinary.roo-code",
    "kilocode.kilo-code",
    "saoudrizwan.claude-dev", // Cline
    "anthropic.anthropic-code",
    "github.copilot",
    "aws.amazon-q",
    "continue.continue", // Continue
  ];

  private constructor() {
    this.adapterChangeEmitter = new vscode.EventEmitter<IAdapter | null>();
    this.actionEmitter = new vscode.EventEmitter<ActionContext>();

    // Listen for extension changes
    this.disposables.push(
      vscode.extensions.onDidChange(() => {
        getLogger().info("Extensions changed, rescanning adapters");
        this.rescanAdapters();
      }),
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
    logger.section("Adapter Registry Initialization");

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
    logger.info("Scanning for compatible extensions...");

    // Clear existing adapters
    this.disposeAdapters();

    const settings = getSettings();
    const { RooCodeAdapter } = await import("./adapters/rooAdapter.js");
    const { KiloCodeAdapter } = await import("./adapters/kiloAdapter.js");
    const { ClineAdapter } = await import("./adapters/clineAdapter.js");
    const { ContinueAdapter } = await import("./adapters/continueAdapter.js");
    const { GenericAdapter } = await import("./adapters/genericAdapter.js");

    const adapterSettings = settings.settings.adapterSettings;

    // Check for Roo Code
    if (adapterSettings.rooCode) {
      const rooAdapter = new RooCodeAdapter();
      if (rooAdapter.isActive()) {
        this.registerAdapter(rooAdapter);
        logger.info("Roo Code adapter registered");
      }
    }

    // Check for Kilo Code
    if (adapterSettings.kiloCode) {
      const kiloAdapter = new KiloCodeAdapter();
      if (kiloAdapter.isActive()) {
        this.registerAdapter(kiloAdapter);
        logger.info("Kilo Code adapter registered");
      }
    }

    // Check for Cline (Enhancement 15)
    if (adapterSettings.cline) {
      const clineAdapter = new ClineAdapter();
      if (clineAdapter.isActive()) {
        this.registerAdapter(clineAdapter);
        logger.info("Cline adapter registered");
      }
    }

    // Check for Continue (Enhancement 15)
    if (adapterSettings.continueExt) {
      const continueAdapter = new ContinueAdapter();
      if (continueAdapter.isActive()) {
        this.registerAdapter(continueAdapter);
        logger.info("Continue adapter registered");
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
      const genericAdapter = new GenericAdapter("generic");
      this.registerAdapter(genericAdapter);
      logger.info("Generic fallback adapter registered");
    }
  }

  /**
   * Register an adapter
   */
  public registerAdapter(adapter: IAdapter): void {
    this.adapters.set(adapter.name, adapter);

    // Wire up events
    adapter.onAction((action: ActionContext) => {
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
    return this.getAllAdapters().filter((a) => a.isActive() && a.isEnabled());
  }

  /**
   * Select the active adapter based on installed extensions
   */
  public selectActiveAdapter(): void {
    const logger = getLogger();

    // Priority order: Roo Code > Kilo Code > Cline > Continue > Generic
    const priority = ["Roo Code", "Kilo Code", "Cline", "Continue", "Generic"];

    for (const name of priority) {
      const adapter = this.adapters.get(name);
      if (adapter && adapter.isActive() && adapter.isEnabled()) {
        this.activeAdapter = adapter;
        this.adapterChangeEmitter.fire(adapter);
        logger.info(`Active adapter selected: ${name}`);
        return;
      }
    }

    // Try any other registered adapter
    for (const adapter of this.adapters.values()) {
      if (adapter.isActive() && adapter.isEnabled()) {
        this.activeAdapter = adapter;
        this.adapterChangeEmitter.fire(adapter);
        logger.info(`Active adapter selected: ${adapter.name}`);
        return;
      }
    }

    // No active adapter found
    this.activeAdapter = null;
    this.adapterChangeEmitter.fire(null);
    logger.warn("No active adapter available");
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
   * Get the active adapter
   */
  public getActiveAdapter(): IAdapter | null {
    return this.activeAdapter;
  }

  /**
   * Rescan adapters
   */
  public async rescanAdapters(): Promise<void> {
    await this.scanForAdapters();
    this.selectActiveAdapter();
  }

  /**
   * Event: when the active adapter changes
   */
  public get onAdapterChange(): vscode.Event<IAdapter | null> {
    return this.adapterChangeEmitter.event;
  }

  /**
   * Event: when any adapter fires an action
   */
  public get onAction(): vscode.Event<ActionContext> {
    return this.actionEmitter.event;
  }

  /**
   * Log status of all adapters
   */
  private logAdapterStatus(): void {
    const logger = getLogger();
    for (const adapter of this.adapters.values()) {
      const status = adapter.getAdapterStatus();
      logger.info(
        `  ${status.name}: active=${status.isActive}, enabled=${status.isEnabled}, pending=${status.pendingActionsCount}`,
      );
    }
  }

  /**
   * Dispose all adapters
   */
  private disposeAdapters(): void {
    for (const adapter of this.adapters.values()) {
      adapter.dispose();
    }
    this.adapters.clear();
    this.activeAdapter = null;
  }

  public dispose(): void {
    this.disposeAdapters();
    this.disposables.forEach((d) => d.dispose());
    this.adapterChangeEmitter.dispose();
    this.actionEmitter.dispose();
  }
}

/**
 * Get the AdapterRegistry singleton
 */
export function getAdapterRegistry(): AdapterRegistry {
  return AdapterRegistry.getInstance();
}
