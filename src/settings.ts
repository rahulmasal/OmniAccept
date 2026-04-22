import * as vscode from "vscode";
import {
  ExtensionSettings,
  ApprovalState,
  LogLevel,
  AdapterSettingsConfig,
  ActionRulesConfig,
  ExtensionMode,
  ConditionalRule,
  TerminalRule,
  RateLimitAction,
} from "./types";
import { getLogger } from "./logger";
import { getWorkspaceConfigLoader } from "./workspaceConfig";
import { getSettingsValidator } from "./settingsValidator";

/**
 * Manages access to extension configuration settings
 */
export class Settings implements vscode.Disposable {
  private static instance: Settings;
  private disposables: vscode.Disposable[] = [];
  private changeEmitter: vscode.EventEmitter<ExtensionSettings>;
  private _settings: ExtensionSettings;

  private readonly configurationId = "universalAutoAccept";

  private constructor() {
    this.changeEmitter = new vscode.EventEmitter<ExtensionSettings>();
    this._settings = this.loadSettings();

    // Listen for configuration changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(this.configurationId)) {
          this._settings = this.loadSettings();
          this.changeEmitter.fire(this._settings);
          getLogger().info("Settings updated");
        }
      }),
    );

    // Listen for workspace config changes
    const workspaceConfigLoader = getWorkspaceConfigLoader();
    this.disposables.push(
      workspaceConfigLoader.onDidChange(() => {
        this._settings = this.loadSettings();
        this.changeEmitter.fire(this._settings);
        getLogger().info("Settings updated (workspace config change)");
      }),
    );
  }

  public static getInstance(): Settings {
    if (!Settings.instance) {
      Settings.instance = new Settings();
    }
    return Settings.instance;
  }

  /**
   * Load settings from VS Code configuration
   */
  private loadSettings(): ExtensionSettings {
    const config = vscode.workspace.getConfiguration(this.configurationId);

    // Check for config version migration
    const configVersion = this.getConfig<number>("configVersion", config) ?? 0;
    if (configVersion < getSettingsValidator().getConfigVersion()) {
      getLogger().info(
        `Config version ${configVersion} needs migration to ${getSettingsValidator().getConfigVersion()}`,
      );
      // Migration will be handled on next startup; for now use current values
    }

    return {
      enabled: this.getConfig<boolean>("enabled", config),
      trustedWorkspaceOnly: this.getConfig<boolean>(
        "trustedWorkspaceOnly",
        config,
      ),
      defaultPolicy: this.getConfig<ApprovalState>("defaultPolicy", config),
      adapterSettings: this.getAdapterSettings(config),
      actionRules: this.getActionRules(config),
      conditionalRules: this.getConditionalRules(config),
      terminalWhitelist: this.getTerminalRules(config, "terminalWhitelist"),
      terminalBlacklist: this.getTerminalRules(config, "terminalBlacklist"),
      sensitiveFilePatterns: this.getConfig<string[]>(
        "sensitiveFilePatterns",
        config,
      ),
      maxUndoBatchSize: this.getConfig<number>("maxUndoBatchSize", config),
      autoApproveDelay: this.getConfig<number>("autoApproveDelay", config),
      logLevel: this.getConfig<LogLevel>("logLevel", config),
      statusBarMode: this.getConfig<ExtensionMode>("statusBarMode", config),
      showNotifications: this.getConfig<boolean>("showNotifications", config),
      audioNotifications: this.getConfig<boolean>("audioNotifications", config),
      audioVolume: this.getConfig<number>("audioVolume", config),
      askModeTimeout: this.getConfig<number>("askModeTimeout", config),
      useGitUndo: this.getConfig<boolean>("useGitUndo", config),
      gitUndoDryRun: this.getConfig<boolean>("gitUndoDryRun", config),
      maxAutoApprovesPerMinute: this.getConfig<number>(
        "maxAutoApprovesPerMinute",
        config,
      ),
      maxAutoApprovesPerSession: this.getConfig<number>(
        "maxAutoApprovesPerSession",
        config,
      ),
      rateLimitAction: this.getConfig<RateLimitAction>(
        "rateLimitAction",
        config,
      ),
      autoApproveBudget: this.getConfig<number>("autoApproveBudget", config),
      changeDebounceMs: this.getConfig<number>("changeDebounceMs", config),
      maxHistorySize: this.getConfig<number>("maxHistorySize", config),
      ignoreWorkspaceConfig: this.getConfig<boolean>(
        "ignoreWorkspaceConfig",
        config,
      ),
      enableTelemetry: this.getConfig<boolean>("enableTelemetry", config),
      configVersion: this.getConfig<number>("configVersion", config),
    };
  }

  /**
   * Get a typed config value with default
   */
  private getConfig<T>(key: string, config: vscode.WorkspaceConfiguration): T {
    const value = config.get<T>(key);
    return value !== undefined ? value : this.getDefault<T>(key);
  }

  /**
   * Get default value for a config key
   */
  private getDefault<T>(key: string): T {
    const defaults: Record<string, unknown> = {
      enabled: true,
      trustedWorkspaceOnly: true,
      defaultPolicy: "ask",
      sensitiveFilePatterns: [
        "**/.env",
        "**/.env.*",
        "**/.ssh/**",
        "**/id_rsa*",
        "**/id_ed25519*",
        "**/id_ecdsa*",
        "**/secrets.*",
        "**/.secrets*",
        "**/credentials*",
        "**/*.pem",
        "**/*.key",
        "**/secrets.json",
        "**/secrets.yaml",
        "**/*.credentials",
        "**/aws*.json",
        "**/azure*.json",
        "**/gcp*.json",
        "**/*password*",
        "**/token.*",
        "**/*.token",
      ],
      maxUndoBatchSize: 10,
      autoApproveDelay: 0,
      logLevel: "info",
      statusBarMode: "on",
      showNotifications: true,
      audioNotifications: false,
      audioVolume: 50,
      askModeTimeout: 300,
      useGitUndo: true,
      gitUndoDryRun: false,
      maxAutoApprovesPerMinute: 30,
      maxAutoApprovesPerSession: 0,
      rateLimitAction: "ask",
      autoApproveBudget: 0,
      changeDebounceMs: 500,
      maxHistorySize: 500,
      ignoreWorkspaceConfig: false,
      enableTelemetry: false,
      configVersion: 1,
    };

    return (defaults[key] ?? undefined) as T;
  }

  /**
   * Get adapter settings
   */
  private getAdapterSettings(
    config: vscode.WorkspaceConfiguration,
  ): AdapterSettingsConfig {
    const adapterConfig = config.get<AdapterSettingsConfig>("adapterSettings");
    return (
      adapterConfig ?? {
        rooCode: true,
        kiloCode: true,
        cline: true,
        cursor: false,
        windsurf: false,
        continueExt: true,
      }
    );
  }

  /**
   * Get action rules, merged with workspace config if applicable
   */
  private getActionRules(
    config: vscode.WorkspaceConfiguration,
  ): ActionRulesConfig {
    const actionConfig = config.get<ActionRulesConfig>("actionRules");
    const baseRules = actionConfig ?? {
      readFiles: ApprovalState.Allow,
      editFiles: ApprovalState.Allow,
      createFiles: ApprovalState.Ask,
      deleteFiles: ApprovalState.Deny,
      renameFiles: ApprovalState.Ask,
      terminalCommand: ApprovalState.Deny,
      browserTool: ApprovalState.Deny,
      mcpToolAccess: ApprovalState.Deny,
      externalDirectoryAccess: ApprovalState.Deny,
      sensitiveFileAccess: ApprovalState.Deny,
    };

    // Merge with workspace config
    if (!this._isIgnoringWorkspaceConfig()) {
      const workspaceConfig = getWorkspaceConfigLoader().getConfig();
      if (workspaceConfig?.actionRules) {
        return { ...baseRules, ...workspaceConfig.actionRules };
      }
    }

    return baseRules;
  }

  /**
   * Get conditional rules, merged with workspace config
   */
  private getConditionalRules(
    config: vscode.WorkspaceConfiguration,
  ): ConditionalRule[] {
    const rules = config.get<ConditionalRule[]>("conditionalRules") ?? [];

    if (!this._isIgnoringWorkspaceConfig()) {
      const workspaceConfig = getWorkspaceConfigLoader().getConfig();
      if (workspaceConfig?.conditionalRules) {
        return [...workspaceConfig.conditionalRules, ...rules];
      }
    }

    return rules;
  }

  /**
   * Get terminal rules (whitelist or blacklist), merged with workspace config
   */
  private getTerminalRules(
    config: vscode.WorkspaceConfiguration,
    key: "terminalWhitelist" | "terminalBlacklist",
  ): TerminalRule[] {
    const rules = config.get<TerminalRule[]>(key) ?? [];

    if (!this._isIgnoringWorkspaceConfig()) {
      const workspaceConfig = getWorkspaceConfigLoader().getConfig();
      const workspaceRules = workspaceConfig?.[key];
      if (workspaceRules) {
        return [...workspaceRules, ...rules];
      }
    }

    return rules;
  }

  /**
   * Check if workspace config should be ignored
   */
  private _isIgnoringWorkspaceConfig(): boolean {
    try {
      const config = vscode.workspace.getConfiguration(this.configurationId);
      return config.get<boolean>("ignoreWorkspaceConfig") ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Get current settings snapshot
   */
  public get settings(): ExtensionSettings {
    return { ...this._settings };
  }

  /**
   * Get enabled state
   */
  public get enabled(): boolean {
    return this._settings.enabled;
  }

  /**
   * Set enabled state
   */
  public async setEnabled(value: boolean): Promise<void> {
    await this.updateSetting("enabled", value);
  }

  /**
   * Check if extension works in trusted workspaces only
   */
  public get trustedWorkspaceOnly(): boolean {
    return this._settings.trustedWorkspaceOnly;
  }

  /**
   * Check if current workspace is trusted
   */
  public isCurrentWorkspaceTrusted(): boolean {
    return vscode.workspace.isTrusted;
  }

  /**
   * Check if auto-approve should be active for current context
   */
  public shouldAutoApprove(): boolean {
    if (!this._settings.enabled) {
      return false;
    }
    if (
      this._settings.trustedWorkspaceOnly &&
      !this.isCurrentWorkspaceTrusted()
    ) {
      return false;
    }
    return true;
  }

  /**
   * Get default policy
   */
  public get defaultPolicy(): ApprovalState {
    return this._settings.defaultPolicy;
  }

  /**
   * Get action rule for a specific action type
   */
  public getActionRule(actionType: string): ApprovalState {
    const rules = this._settings.actionRules as unknown as Record<
      string,
      ApprovalState
    >;
    return rules[actionType] ?? this._settings.defaultPolicy;
  }

  /**
   * Get sensitive file patterns
   */
  public get sensitiveFilePatterns(): string[] {
    return [...this._settings.sensitiveFilePatterns];
  }

  /**
   * Get max undo batch size
   */
  public get maxUndoBatchSize(): number {
    return this._settings.maxUndoBatchSize;
  }

  /**
   * Get auto approve delay in milliseconds
   */
  public get autoApproveDelay(): number {
    return this._settings.autoApproveDelay;
  }

  /**
   * Get log level
   */
  public get logLevel(): LogLevel {
    return this._settings.logLevel;
  }

  /**
   * Get status bar mode
   */
  public get statusBarMode(): ExtensionMode {
    return this._settings.statusBarMode;
  }

  /**
   * Set status bar mode
   */
  public async setStatusBarMode(mode: ExtensionMode): Promise<void> {
    await this.updateSetting("statusBarMode", mode);
  }

  /**
   * Check if notifications should be shown
   */
  public get showNotifications(): boolean {
    return this._settings.showNotifications;
  }

  /**
   * Check if audio notifications are enabled
   */
  public get audioNotifications(): boolean {
    return this._settings.audioNotifications;
  }

  /**
   * Get audio volume (0-100)
   */
  public get audioVolume(): number {
    return this._settings.audioVolume;
  }

  /**
   * Get ask mode timeout in seconds
   */
  public get askModeTimeout(): number {
    return this._settings.askModeTimeout;
  }

  /**
   * Check if git-based undo is enabled
   */
  public get useGitUndo(): boolean {
    return this._settings.useGitUndo;
  }

  /**
   * Check if git undo dry run is enabled
   */
  public get gitUndoDryRun(): boolean {
    return this._settings.gitUndoDryRun;
  }

  /**
   * Get max auto-approves per minute (0 = unlimited)
   */
  public get maxAutoApprovesPerMinute(): number {
    return this._settings.maxAutoApprovesPerMinute;
  }

  /**
   * Get max auto-approves per session (0 = unlimited)
   */
  public get maxAutoApprovesPerSession(): number {
    return this._settings.maxAutoApprovesPerSession;
  }

  /**
   * Get rate limit action
   */
  public get rateLimitAction(): RateLimitAction {
    return this._settings.rateLimitAction;
  }

  /**
   * Get auto-approve budget (0 = unlimited)
   */
  public get autoApproveBudget(): number {
    return this._settings.autoApproveBudget;
  }

  /**
   * Get change debounce milliseconds
   */
  public get changeDebounceMs(): number {
    return this._settings.changeDebounceMs;
  }

  /**
   * Get max history size
   */
  public get maxHistorySize(): number {
    return this._settings.maxHistorySize;
  }

  /**
   * Check if workspace config should be ignored
   */
  public get ignoreWorkspaceConfig(): boolean {
    return this._settings.ignoreWorkspaceConfig;
  }

  /**
   * Check if telemetry is enabled
   */
  public get enableTelemetry(): boolean {
    return this._settings.enableTelemetry;
  }

  /**
   * Get conditional rules
   */
  public get conditionalRules(): ConditionalRule[] {
    return [...this._settings.conditionalRules];
  }

  /**
   * Get terminal whitelist
   */
  public get terminalWhitelist(): TerminalRule[] {
    return [...this._settings.terminalWhitelist];
  }

  /**
   * Get terminal blacklist
   */
  public get terminalBlacklist(): TerminalRule[] {
    return [...this._settings.terminalBlacklist];
  }

  /**
   * Check if a specific adapter is enabled
   */
  public isAdapterEnabled(adapterName: string): boolean {
    const name = adapterName.toLowerCase();
    const adapterSettings = this._settings.adapterSettings;

    if (name === "roocode" || name === "roo code") {
      return adapterSettings.rooCode;
    }
    if (name === "kilocode" || name === "kilo code") {
      return adapterSettings.kiloCode;
    }
    if (name === "cline") {
      return adapterSettings.cline;
    }
    if (name === "cursor") {
      return adapterSettings.cursor;
    }
    if (name === "windsurf") {
      return adapterSettings.windsurf;
    }
    if (name === "continue" || name === "continue ext") {
      return adapterSettings.continueExt;
    }
    return true;
  }

  /**
   * Update a single setting
   */
  public async updateSetting(key: string, value: unknown): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.configurationId);
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }

  /**
   * Update multiple settings at once
   */
  public async updateSettings(
    updates: Partial<ExtensionSettings>,
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.configurationId);

    for (const [key, value] of Object.entries(updates)) {
      await config.update(key, value, vscode.ConfigurationTarget.Global);
    }
  }

  /**
   * Reset settings to defaults
   */
  public async resetToDefaults(): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.configurationId);

    const keys = [
      "enabled",
      "trustedWorkspaceOnly",
      "defaultPolicy",
      "adapterSettings",
      "actionRules",
      "conditionalRules",
      "terminalWhitelist",
      "terminalBlacklist",
      "sensitiveFilePatterns",
      "maxUndoBatchSize",
      "autoApproveDelay",
      "logLevel",
      "statusBarMode",
      "showNotifications",
      "audioNotifications",
      "audioVolume",
      "askModeTimeout",
      "useGitUndo",
      "gitUndoDryRun",
      "maxAutoApprovesPerMinute",
      "maxAutoApprovesPerSession",
      "rateLimitAction",
      "autoApproveBudget",
      "changeDebounceMs",
      "maxHistorySize",
      "ignoreWorkspaceConfig",
      "enableTelemetry",
      "configVersion",
    ];

    for (const key of keys) {
      await config.update(key, undefined, vscode.ConfigurationTarget.Global);
    }

    getLogger().info("Settings reset to defaults");
  }

  /**
   * Event that fires when settings change
   */
  public get onDidChange(): vscode.Event<ExtensionSettings> {
    return this.changeEmitter.event;
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.changeEmitter.dispose();
  }
}

/**
 * Get the Settings singleton
 */
export function getSettings(): Settings {
  return Settings.getInstance();
}
