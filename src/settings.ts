import * as vscode from 'vscode';
import {
    ExtensionSettings,
    ApprovalState,
    LogLevel,
    AdapterSettingsConfig,
    ActionRulesConfig,
    ExtensionMode
} from './types';
import { getLogger } from './logger';

/**
 * Manages access to extension configuration settings
 */
export class Settings implements vscode.Disposable {
    private static instance: Settings;
    private disposables: vscode.Disposable[] = [];
    private changeEmitter: vscode.EventEmitter<ExtensionSettings>;
    private _settings: ExtensionSettings;

    private readonly configurationId = 'universalAutoAccept';

    private constructor() {
        this.changeEmitter = new vscode.EventEmitter<ExtensionSettings>();
        this._settings = this.loadSettings();

        // Listen for configuration changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration(this.configurationId)) {
                    this._settings = this.loadSettings();
                    this.changeEmitter.fire(this._settings);
                    getLogger().info('Settings updated:', this._settings);
                }
            })
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
        
        return {
            enabled: this.getConfig<boolean>('enabled', config),
            trustedWorkspaceOnly: this.getConfig<boolean>('trustedWorkspaceOnly', config),
            defaultPolicy: this.getConfig<ApprovalState>('defaultPolicy', config),
            adapterSettings: this.getAdapterSettings(config),
            actionRules: this.getActionRules(config),
            sensitiveFilePatterns: this.getConfig<string[]>('sensitiveFilePatterns', config),
            maxUndoBatchSize: this.getConfig<number>('maxUndoBatchSize', config),
            autoApproveDelay: this.getConfig<number>('autoApproveDelay', config),
            logLevel: this.getConfig<LogLevel>('logLevel', config),
            statusBarMode: this.getConfig<ExtensionMode>('statusBarMode', config),
            showNotifications: this.getConfig<boolean>('showNotifications', config),
            askModeTimeout: this.getConfig<number>('askModeTimeout', config)
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
        const defaults: Record<string, T> = {
            enabled: true as T,
            trustedWorkspaceOnly: true as T,
            defaultPolicy: 'ask' as T,
            sensitiveFilePatterns: [
                '**/.env*',
                '**/.env',
                '**/.env.*',
                '**/.ssh/**',
                '**/id_*',
                '**/*secret*',
                '**/*token*',
                '**/*key*',
                '**/credentials*',
                '**/*.pem',
                '**/*.key',
                '**/secrets.json',
                '**/secrets.yaml',
                '**/*.credentials',
                '**/aws*.json',
                '**/azure*.json',
                '**/*password*'
            ] as T,
            maxUndoBatchSize: 10 as T,
            autoApproveDelay: 0 as T,
            logLevel: 'info' as T,
            statusBarMode: 'on' as T,
            showNotifications: true as T,
            askModeTimeout: 300 as T
        };

        return defaults[key] ?? (undefined as unknown as T);
    }

    /**
     * Get adapter settings
     */
    private getAdapterSettings(config: vscode.WorkspaceConfiguration): AdapterSettingsConfig {
        const adapterConfig = config.get<AdapterSettingsConfig>('adapterSettings');
        return adapterConfig ?? {
            rooCode: true,
            kiloCode: true
        };
    }

    /**
     * Get action rules
     */
    private getActionRules(config: vscode.WorkspaceConfiguration): ActionRulesConfig {
        const actionConfig = config.get<ActionRulesConfig>('actionRules');
        return actionConfig ?? {
            readFiles: ApprovalState.Allow,
            editFiles: ApprovalState.Allow,
            createFiles: ApprovalState.Ask,
            deleteFiles: ApprovalState.Deny,
            renameFiles: ApprovalState.Ask,
            terminalCommand: ApprovalState.Deny,
            browserTool: ApprovalState.Deny,
            mcpToolAccess: ApprovalState.Deny,
            externalDirectoryAccess: ApprovalState.Deny,
            sensitiveFileAccess: ApprovalState.Deny
        };
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
        await this.updateSetting('enabled', value);
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
        if (this._settings.trustedWorkspaceOnly && !this.isCurrentWorkspaceTrusted()) {
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
        const rules = this._settings.actionRules as unknown as Record<string, ApprovalState>;
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
        await this.updateSetting('statusBarMode', mode);
    }

    /**
     * Check if notifications should be shown
     */
    public get showNotifications(): boolean {
        return this._settings.showNotifications;
    }

    /**
     * Get ask mode timeout in seconds
     */
    public get askModeTimeout(): number {
        return this._settings.askModeTimeout;
    }

    /**
     * Check if a specific adapter is enabled
     */
    public isAdapterEnabled(adapterName: string): boolean {
        const name = adapterName.toLowerCase();
        if (name === 'roocode' || name === 'roo code') {
            return this._settings.adapterSettings.rooCode;
        }
        if (name === 'kilocode' || name === 'kilo code') {
            return this._settings.adapterSettings.kiloCode;
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
    public async updateSettings(updates: Partial<ExtensionSettings>): Promise<void> {
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
            'enabled',
            'trustedWorkspaceOnly',
            'defaultPolicy',
            'adapterSettings',
            'actionRules',
            'sensitiveFilePatterns',
            'maxUndoBatchSize',
            'autoApproveDelay',
            'logLevel',
            'statusBarMode',
            'showNotifications',
            'askModeTimeout'
        ];

        for (const key of keys) {
            await config.update(key, undefined, vscode.ConfigurationTarget.Global);
        }
    }

    /**
     * Event fired when settings change
     */
    public get onDidChange(): vscode.Event<ExtensionSettings> {
        return this.changeEmitter.event;
    }

    /**
     * Dispose the settings manager
     */
    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.changeEmitter.dispose();
        // Use a type-safe way to allow instance reset for testing
        (Settings as unknown as { instance?: Settings }).instance = undefined;
    }
}

/**
 * Helper to get settings instance
 */
export function getSettings(): Settings {
    return Settings.getInstance();
}