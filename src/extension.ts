import * as vscode from "vscode";
import { getLogger, Logger } from "./logger";
import { getSettings, Settings } from "./settings";
import { getApprovalEngine, ApprovalEngine } from "./approvalEngine";
import { getAdapterRegistry, AdapterRegistry } from "./adapterRegistry";
import { getCommands, Commands } from "./commands";
import { getActionHistory, ActionHistory } from "./actionHistory";
import {
  getWorkspaceConfigLoader,
  WorkspaceConfigLoader,
} from "./workspaceConfig";
import { getTelemetry, TelemetryService } from "./telemetry";
import { getTreeDataProvider, OmniAcceptTreeDataProvider } from "./treeView";
import { getSettingsValidator, SettingsValidator } from "./settingsValidator";
import {
  TelemetryEvent,
  ActionContext,
  ActionBatch,
  IAdapter,
  ExtensionSettings,
} from "./types";

/**
 * Extension mode for status bar
 */
type ExtensionMode = "on" | "ask" | "off";

/**
 * Status bar manager for the extension
 */
class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];
  private currentMode: ExtensionMode = "on";
  private currentAdapter: string = "";

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      "universalAutoAccept.statusBar",
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.statusBarItem.command = "universalAutoAccept.toggleEnabled";
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
    this.currentAdapter = adapter?.name || "None";

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
    this.currentAdapter = adapter?.name || "None";

    // Build status text
    let text: string;
    let tooltip: string;
    let color: string | undefined;

    switch (this.currentMode) {
      case "on":
        text = `$(check) Auto: ${this.currentAdapter}`;
        tooltip = `OmniAccept: ON\nAdapter: ${this.currentAdapter}\nClick to toggle`;
        color = "#2ea043"; // Green
        break;
      case "ask":
        text = `$(question) Auto: ASK`;
        tooltip = `OmniAccept: ASK\nAdapter: ${this.currentAdapter}\nClick to toggle`;
        color = "#d29922"; // Yellow/Orange
        break;
      case "off":
      default:
        text = `$(x) Auto: OFF`;
        tooltip = `OmniAccept: OFF\nClick to enable`;
        color = "#f85149"; // Red
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
    const modes: ExtensionMode[] = ["on", "ask", "off"];
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
      this.statusBarItem.command = "universalAutoAccept.showDiffPreview";
    } else {
      this.updateDisplay();
    }
  }

  /**
   * Dispose the status bar
   */
  public dispose(): void {
    this.statusBarItem.dispose();
    this.disposables.forEach((d) => d.dispose());
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
  private actionHistory: ActionHistory | null = null;
  private workspaceConfigLoader: WorkspaceConfigLoader | null = null;
  private telemetryService: TelemetryService | null = null;
  private treeDataProvider: OmniAcceptTreeDataProvider | null = null;
  private settingsValidator: SettingsValidator | null = null;

  /**
   * Initialize the extension
   */
  public async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;

    // Initialize logger first
    this.logger = getLogger();
    this.logger.section("OmniAccept Extension");
    this.logger.info("Initializing extension...");

    try {
      // Initialize settings (must be early — other services depend on it)
      this.settings = getSettings();
      this.logger.setLogLevel(this.settings.logLevel);
      this.logger.info(`Log level: ${this.settings.logLevel}`);

      // Initialize workspace config loader (settings depends on it via import)
      this.workspaceConfigLoader = getWorkspaceConfigLoader();
      await this.workspaceConfigLoader.initialize();
      this.logger.info("Workspace config loader initialized");

      // Initialize settings validator
      this.settingsValidator = getSettingsValidator();
      this.logger.info("Settings validator initialized");

      // Check if settings need migration
      const currentSettings = this.settings.settings;
      const configVersion = currentSettings.configVersion ?? 0;
      const latestVersion = this.settingsValidator.getConfigVersion();
      if (configVersion < latestVersion) {
        this.logger.info(
          `Settings migration needed: v${configVersion} → v${latestVersion}`,
        );
        const migrated = this.settingsValidator.migrate(
          currentSettings as unknown as Record<string, unknown>,
          configVersion,
        );
        // Apply migrated settings
        for (const [key, value] of Object.entries(migrated)) {
          if (key !== "configVersion") {
            await this.settings.updateSetting(key, value);
          }
        }
        await this.settings.updateSetting("configVersion", latestVersion);
        this.logger.info("Settings migrated successfully");
      }

      // Validate current settings
      const validationResult = this.settingsValidator.validate(
        this.settings.settings,
      );
      if (validationResult.errors.length > 0) {
        this.logger?.warn(
          `Settings validation found ${validationResult.errors.length} error(s)`,
        );
        validationResult.errors.forEach((e) =>
          this.logger?.warn(`  - ${e.key}: ${e.message}`),
        );
      }
      if (validationResult.warnings.length > 0) {
        this.logger?.info(
          `Settings validation found ${validationResult.warnings.length} warning(s)`,
        );
        validationResult.warnings.forEach((w) =>
          this.logger?.info(`  - ${w.key}: ${w.message}`),
        );
      }

      // Initialize action history (needs context for persistence)
      this.actionHistory = getActionHistory();
      this.actionHistory.initialize(context, this.settings.maxHistorySize);
      this.logger.info("Action history initialized");

      // Initialize telemetry (opt-in)
      this.telemetryService = getTelemetry();
      this.telemetryService.initialize();
      this.logger.info("Telemetry service initialized");

      // Initialize approval engine
      this.approvalEngine = getApprovalEngine();
      this.logger.info("Approval engine initialized");

      // Initialize adapter registry
      this.adapterRegistry = getAdapterRegistry();
      await this.adapterRegistry.initialize();
      this.logger.info("Adapter registry initialized");

      // Initialize tree view data provider
      this.treeDataProvider = getTreeDataProvider();
      this.logger.info("Tree data provider initialized");

      // Initialize commands
      this.commands = getCommands();
      this.logger.info("Commands initialized");

      // Initialize status bar
      this.statusBarManager = new StatusBarManager();
      this.statusBarManager.updateFromSettings();
      this.logger.info("Status bar initialized");

      // Register tree view
      this.registerTreeView(context);
      this.logger.info("Tree view registered");

      // Setup event handlers
      this.setupEventHandlers();

      // Update context flags for command visibility
      this.updateContextFlags();

      // Send activation telemetry
      this.telemetryService.sendEvent(TelemetryEvent.ExtensionActivated, {
        adapterCount: String(this.adapterRegistry.getAllAdapters().length),
        activeAdapter: this.adapterRegistry.getActiveAdapter()?.name || "none",
      });

      this.logger.info("Extension initialization complete");
    } catch (error) {
      this.logger?.error(`Initialization failed: ${error}`);
      throw error;
    }
  }

  /**
   * Register the tree view with VS Code
   */
  private registerTreeView(context: vscode.ExtensionContext): void {
    const treeView = vscode.window.createTreeView("omniAcceptTreeView", {
      treeDataProvider: this.treeDataProvider!,
      showCollapseAll: true,
    });

    context.subscriptions.push(treeView);
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    if (!this.approvalEngine || !this.statusBarManager) {
      return;
    }

    // Handle action events
    this.approvalEngine.onAction((action: ActionContext) => {
      this.logger?.debug(`Action received: ${action.type}`);
    });

    // Handle approval events
    this.approvalEngine.onApproval((action: ActionContext) => {
      this.logger?.info(`Action approved: ${action.id}`);
      this.updateContextFlags();
      this.treeDataProvider?.refresh();
    });

    // Handle rejection events
    this.approvalEngine.onRejection((action: ActionContext) => {
      this.logger?.info(`Action rejected: ${action.id}`);
      this.updateContextFlags();
      this.treeDataProvider?.refresh();
    });

    // Handle batch events
    this.approvalEngine.onBatch((batch: ActionBatch) => {
      this.logger?.info(`Batch ${batch.status}: ${batch.id}`);
      this.updateContextFlags();
      this.treeDataProvider?.refresh();
    });

    // Handle adapter changes
    if (this.adapterRegistry) {
      this.adapterRegistry.onAdapterChange((adapter: IAdapter | null) => {
        this.logger?.info(`Active adapter changed: ${adapter?.name || "none"}`);
        this.statusBarManager?.updateDisplay();
        this.updateContextFlags();
        this.treeDataProvider?.refresh();
      });
    }

    // Handle settings changes
    if (this.settings) {
      this.settings.onDidChange((changedSettings: ExtensionSettings) => {
        this.logger?.setLogLevel(changedSettings.logLevel);
        this.statusBarManager?.updateFromSettings();
        this.updateContextFlags();
        this.treeDataProvider?.refresh();

        // Update action history max size if changed
        if (this.actionHistory) {
          this.actionHistory.setMaxHistorySize(changedSettings.maxHistorySize);
        }
      });
    }

    // Handle workspace config changes
    if (this.workspaceConfigLoader) {
      this.workspaceConfigLoader.onDidChange(() => {
        this.logger?.info("Workspace config changed");
        this.treeDataProvider?.refresh();
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

    const isActive = this.settings?.enabled ?? false;
    const hasPending = this.approvalEngine?.hasPendingActions() ?? false;
    const hasUndo = this.approvalEngine?.hasUndoHistory() ?? false;

    // These context keys can be used in when clauses
    vscode.commands.executeCommand(
      "setContext",
      "universalAutoAccept:isActive",
      isActive,
    );
    vscode.commands.executeCommand(
      "setContext",
      "universalAutoAccept:hasPendingActions",
      hasPending,
    );
    vscode.commands.executeCommand(
      "setContext",
      "universalAutoAccept:hasUndoHistory",
      hasUndo,
    );
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
    this.logger?.info("Disposing extension...");

    // Send deactivation telemetry
    if (this.telemetryService) {
      this.telemetryService.sendEvent(TelemetryEvent.ExtensionDeactivated, {});
    }

    this.statusBarManager?.dispose();
    this.commands?.dispose();
    this.treeDataProvider?.dispose();
    this.adapterRegistry?.dispose();
    this.approvalEngine?.dispose();
    this.telemetryService?.dispose();
    this.actionHistory?.dispose();
    this.workspaceConfigLoader?.dispose();
    this.settings?.dispose();
    this.logger?.dispose();

    this.context = null;
    this.logger = null;
    this.settings = null;
    this.approvalEngine = null;
    this.adapterRegistry = null;
    this.commands = null;
    this.statusBarManager = null;
    this.actionHistory = null;
    this.workspaceConfigLoader = null;
    this.telemetryService = null;
    this.treeDataProvider = null;
    this.settingsValidator = null;
  }
}

// Global context manager
let contextManager: ExtensionContextManager | null = null;

/**
 * Called when the extension is activated
 */
export function activate(context: vscode.ExtensionContext): void {
  // Create and initialize context manager
  contextManager = new ExtensionContextManager();

  contextManager.initialize(context).catch((error: unknown) => {
    vscode.window.showErrorMessage(`OmniAccept failed to initialize: ${error}`);
  });

  // Register deactivation handler
  context.subscriptions.push({
    dispose: () => {
      contextManager?.dispose();
    },
  });
}

/**
 * Called when the extension is deactivated
 */
export function deactivate(): void {
  contextManager?.dispose();
  contextManager = null;
}
