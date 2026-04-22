import * as vscode from "vscode";
import {
  WorkspaceConfig,
  ConditionalRule,
  TerminalRule,
  ActionRulesConfig,
  ApprovalState,
} from "./types";
import { getLogger } from "./logger";

/**
 * Manages workspace-level configuration from .omniaccept.json files
 */
export class WorkspaceConfigLoader {
  private static instance: WorkspaceConfigLoader;
  private config: WorkspaceConfig | null = null;
  private configUri: vscode.Uri | null = null;
  private disposables: vscode.Disposable[] = [];
  private changeEmitter: vscode.EventEmitter<WorkspaceConfig | null>;

  private readonly configFileName = ".omniaccept.json";

  private constructor() {
    this.changeEmitter = new vscode.EventEmitter<WorkspaceConfig | null>();

    // Watch for config file changes
    const watcher = vscode.workspace.createFileSystemWatcher(
      `**/${this.configFileName}`,
    );
    watcher.onDidCreate((uri) => this.onConfigFileChange(uri));
    watcher.onDidChange((uri) => this.onConfigFileChange(uri));
    watcher.onDidDelete((uri) => this.onConfigFileDelete(uri));
    this.disposables.push(watcher);
  }

  public static getInstance(): WorkspaceConfigLoader {
    if (!WorkspaceConfigLoader.instance) {
      WorkspaceConfigLoader.instance = new WorkspaceConfigLoader();
    }
    return WorkspaceConfigLoader.instance;
  }

  /**
   * Initialize by loading workspace config if present
   */
  public async initialize(): Promise<void> {
    await this.loadConfig();
  }

  /**
   * Event fired when workspace config changes
   */
  public get onDidChange(): vscode.Event<WorkspaceConfig | null> {
    return this.changeEmitter.event;
  }

  /**
   * Load the workspace config file
   */
  private async loadConfig(): Promise<void> {
    const logger = getLogger();

    // Find .omniaccept.json in workspace root(s)
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.config = null;
      this.configUri = null;
      return;
    }

    // Check first workspace folder
    const configUri = vscode.Uri.joinPath(
      workspaceFolders[0].uri,
      this.configFileName,
    );

    try {
      const stat = await vscode.workspace.fs.stat(configUri);
      if (stat.type === vscode.FileType.File) {
        const content = await vscode.workspace.fs.readFile(configUri);
        const text = new TextDecoder().decode(content);
        const parsed = JSON.parse(text);
        this.config = this.validateAndNormalize(parsed);
        this.configUri = configUri;
        logger.info(`Workspace config loaded from ${configUri.fsPath}`);
      }
    } catch (error) {
      // File doesn't exist or is invalid — that's fine
      this.config = null;
      this.configUri = null;
      logger.debug(`No workspace config found or invalid: ${error}`);
    }
  }

  /**
   * Validate and normalize a parsed config object
   */
  private validateAndNormalize(raw: Record<string, unknown>): WorkspaceConfig {
    const config: WorkspaceConfig = {};

    // Action rules
    if (raw.actionRules && typeof raw.actionRules === "object") {
      config.actionRules = {};
      const validKeys: (keyof ActionRulesConfig)[] = [
        "readFiles",
        "editFiles",
        "createFiles",
        "deleteFiles",
        "renameFiles",
        "terminalCommand",
        "browserTool",
        "mcpToolAccess",
        "externalDirectoryAccess",
        "sensitiveFileAccess",
      ];
      const validValues: ApprovalState[] = [
        ApprovalState.Allow,
        ApprovalState.Ask,
        ApprovalState.Deny,
      ];

      for (const key of validKeys) {
        const value = (raw.actionRules as Record<string, unknown>)[key];
        if (
          typeof value === "string" &&
          validValues.includes(value as ApprovalState)
        ) {
          (config.actionRules as Record<string, ApprovalState>)[key] =
            value as ApprovalState;
        }
      }
    }

    // Conditional rules
    if (Array.isArray(raw.conditionalRules)) {
      config.conditionalRules = raw.conditionalRules
        .filter((rule: unknown) => this.isValidConditionalRule(rule))
        .map((rule: Record<string, unknown>) => ({
          pattern: String(rule.pattern),
          policy: String(rule.policy) as ApprovalState,
          actionType: rule.actionType ? String(rule.actionType) : undefined,
          adapterName: rule.adapterName ? String(rule.adapterName) : undefined,
        })) as ConditionalRule[];
    }

    // Terminal whitelist
    if (Array.isArray(raw.terminalWhitelist)) {
      config.terminalWhitelist = raw.terminalWhitelist
        .filter((rule: unknown) => this.isValidTerminalRule(rule))
        .map((rule: Record<string, unknown>) => ({
          pattern: String(rule.pattern),
          policy: String(rule.policy) as ApprovalState,
        })) as TerminalRule[];
    }

    // Terminal blacklist
    if (Array.isArray(raw.terminalBlacklist)) {
      config.terminalBlacklist = raw.terminalBlacklist
        .filter((rule: unknown) => this.isValidTerminalRule(rule))
        .map((rule: Record<string, unknown>) => ({
          pattern: String(rule.pattern),
          policy: String(rule.policy) as ApprovalState,
        })) as TerminalRule[];
    }

    // Sensitive file patterns
    if (Array.isArray(raw.sensitiveFilePatterns)) {
      config.sensitiveFilePatterns = raw.sensitiveFilePatterns
        .filter((p: unknown) => typeof p === "string")
        .map((p: string) => String(p));
    }

    return config;
  }

  /**
   * Validate a conditional rule object
   */
  private isValidConditionalRule(rule: unknown): boolean {
    if (!rule || typeof rule !== "object") {
      return false;
    }
    const r = rule as Record<string, unknown>;
    return (
      typeof r.pattern === "string" &&
      typeof r.policy === "string" &&
      [ApprovalState.Allow, ApprovalState.Ask, ApprovalState.Deny].includes(
        r.policy as ApprovalState,
      )
    );
  }

  /**
   * Validate a terminal rule object
   */
  private isValidTerminalRule(rule: unknown): boolean {
    if (!rule || typeof rule !== "object") {
      return false;
    }
    const r = rule as Record<string, unknown>;
    return (
      typeof r.pattern === "string" &&
      typeof r.policy === "string" &&
      [ApprovalState.Allow, ApprovalState.Ask, ApprovalState.Deny].includes(
        r.policy as ApprovalState,
      )
    );
  }

  /**
   * Handle config file change
   */
  private async onConfigFileChange(uri: vscode.Uri): Promise<void> {
    const logger = getLogger();
    logger.info(`Workspace config file changed: ${uri.fsPath}`);
    await this.loadConfig();
    this.changeEmitter.fire(this.config);
  }

  /**
   * Handle config file deletion
   */
  private onConfigFileDelete(uri: vscode.Uri): void {
    const logger = getLogger();
    logger.info(`Workspace config file deleted: ${uri.fsPath}`);
    this.config = null;
    this.configUri = null;
    this.changeEmitter.fire(null);
  }

  /**
   * Get the current workspace config
   */
  public getConfig(): WorkspaceConfig | null {
    return this.config;
  }

  /**
   * Check if a workspace config is loaded
   */
  public hasConfig(): boolean {
    return this.config !== null;
  }

  /**
   * Get the URI of the loaded config file
   */
  public getConfigUri(): vscode.Uri | null {
    return this.configUri;
  }

  /**
   * Scaffold a new .omniaccept.json in the workspace root
   */
  public async scaffoldConfig(): Promise<boolean> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage("No workspace folder open");
      return false;
    }

    const targetUri = vscode.Uri.joinPath(
      workspaceFolders[0].uri,
      this.configFileName,
    );

    // Check if file already exists
    try {
      await vscode.workspace.fs.stat(targetUri);
      const overwrite = await vscode.window.showWarningMessage(
        `${this.configFileName} already exists. Overwrite?`,
        "Overwrite",
        "Cancel",
      );
      if (overwrite !== "Overwrite") {
        return false;
      }
    } catch {
      // File doesn't exist — proceed
    }

    const sampleConfig = {
      actionRules: {
        editFiles: "ask",
        terminalCommand: "deny",
      },
      conditionalRules: [
        { pattern: "src/test/**", policy: "allow", actionType: "editFiles" },
      ],
      sensitiveFilePatterns: ["**/config/*.prod.*"],
    };

    const content = new TextEncoder().encode(
      JSON.stringify(sampleConfig, null, 2),
    );

    try {
      await vscode.workspace.fs.writeFile(targetUri, content);
      vscode.window.showInformationMessage(`Created ${this.configFileName}`);
      await this.loadConfig();
      return true;
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to create ${this.configFileName}: ${error}`,
      );
      return false;
    }
  }

  /**
   * Open the workspace config file in the editor
   */
  public async openConfig(): Promise<void> {
    if (this.configUri) {
      await vscode.window.showTextDocument(this.configUri);
    } else {
      vscode.window.showInformationMessage(
        `No ${this.configFileName} found in workspace`,
      );
    }
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.changeEmitter.dispose();
  }
}

/**
 * Get the WorkspaceConfigLoader singleton
 */
export function getWorkspaceConfigLoader(): WorkspaceConfigLoader {
  return WorkspaceConfigLoader.getInstance();
}
