import * as vscode from "vscode";
import {
  ActionType,
  ApprovalState,
  RiskLevel,
  ActionContext,
  RiskAnalysisResult,
  ConditionalRule,
  TerminalRule,
} from "./types";
import { getLogger } from "./logger";
import { getSettings } from "./settings";

/**
 * Analyzes the risk level of actions to determine approval requirements
 */
export class RiskAnalyzer {
  private static instance: RiskAnalyzer;
  private pathCache: Map<string, boolean> = new Map();
  private workspaceFolders: readonly vscode.WorkspaceFolder[] = [];

  private constructor() {
    this.refreshWorkspaceFolders();

    // Listen for workspace folder changes
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.refreshWorkspaceFolders();
    });
  }

  public static getInstance(): RiskAnalyzer {
    if (!RiskAnalyzer.instance) {
      RiskAnalyzer.instance = new RiskAnalyzer();
    }
    return RiskAnalyzer.instance;
  }

  /**
   * Refresh cached workspace folder information
   */
  private refreshWorkspaceFolders(): void {
    this.workspaceFolders = vscode.workspace.workspaceFolders
      ? [...vscode.workspace.workspaceFolders]
      : [];
    this.pathCache.clear();
    getLogger().debug(`Workspace folders: ${this.workspaceFolders.length}`);
  }

  /**
   * Analyze the risk of an action
   */
  public analyze(action: ActionContext): RiskAnalysisResult {
    const reasons: string[] = [];

    // Check if action is enabled
    const settings = getSettings();
    if (!settings.enabled) {
      reasons.push("Extension is disabled");
      return { level: RiskLevel.High, reasons };
    }

    // Check trusted workspace requirement
    if (
      settings.trustedWorkspaceOnly &&
      !settings.isCurrentWorkspaceTrusted()
    ) {
      reasons.push("Workspace is not trusted");
      return { level: RiskLevel.High, reasons };
    }

    // Check adapter enabled state
    if (!settings.isAdapterEnabled(action.adapterName)) {
      reasons.push(`Adapter '${action.adapterName}' is disabled`);
      return { level: RiskLevel.High, reasons };
    }

    // Check terminal whitelist/blacklist first (Enhancement 4)
    if (action.type === ActionType.TerminalCommand && action.command) {
      const terminalOverride = this.checkTerminalRules(
        action.command,
        settings.terminalWhitelist,
        settings.terminalBlacklist,
      );
      if (terminalOverride) {
        return terminalOverride;
      }
    }

    // Check sensitive file patterns (Enhancement 13: improved patterns)
    if (this.isSensitivePath(action)) {
      reasons.push("Action involves sensitive file(s)");
      return {
        level: RiskLevel.High,
        reasons,
        overrideRule: "sensitiveFileAccess",
      };
    }

    // Check action type specific risks
    const typeResult = this.analyzeByActionType(action);
    reasons.push(...typeResult.reasons);

    // Check for destructive commands
    if (this.isDestructiveAction(action)) {
      reasons.push("Action is destructive");
      return { level: RiskLevel.High, reasons };
    }

    // Check external directory access
    if (this.isExternalDirectoryAccess(action)) {
      reasons.push("Action accesses directory outside workspace");
      return {
        level: RiskLevel.High,
        reasons,
        overrideRule: "externalDirectoryAccess",
      };
    }

    // Check workspace boundary
    if (!action.isWorkspaceFile && action.files && action.files.length > 0) {
      reasons.push("Action involves files outside workspace");
      return { level: RiskLevel.Medium, reasons };
    }

    // Check conditional rules (Enhancement 3)
    const conditionalOverride = this.checkConditionalRules(
      action,
      settings.conditionalRules,
    );
    if (conditionalOverride) {
      return conditionalOverride;
    }

    // Determine final risk level based on accumulated reasons
    return this.determineRiskLevel(reasons, typeResult);
  }

  /**
   * Analyze risk based on action type
   */
  private analyzeByActionType(action: ActionContext): RiskAnalysisResult {
    const reasons: string[] = [];

    switch (action.type) {
      case ActionType.ReadFiles:
        reasons.push("Reading file(s)");
        break;
      case ActionType.EditFiles:
        reasons.push("Editing file(s)");
        if (action.files && action.files.length > 1) {
          reasons.push("Multiple files to edit");
        }
        break;
      case ActionType.CreateFiles:
        reasons.push("Creating new file(s)");
        break;
      case ActionType.DeleteFiles:
        reasons.push("Deleting file(s)");
        return { level: RiskLevel.High, reasons, overrideRule: "deleteFiles" };
      case ActionType.RenameFiles:
        reasons.push("Renaming file(s)");
        break;
      case ActionType.TerminalCommand:
        reasons.push("Executing terminal command");
        return {
          level: RiskLevel.High,
          reasons,
          overrideRule: "terminalCommand",
        };
      case ActionType.BrowserTool:
        reasons.push("Browser automation");
        return { level: RiskLevel.High, reasons, overrideRule: "browserTool" };
      case ActionType.McpToolAccess:
        reasons.push("MCP tool access");
        return {
          level: RiskLevel.High,
          reasons,
          overrideRule: "mcpToolAccess",
        };
      case ActionType.ExternalDirectoryAccess:
        reasons.push("External directory access");
        return {
          level: RiskLevel.High,
          reasons,
          overrideRule: "externalDirectoryAccess",
        };
      case ActionType.SensitiveFileAccess:
        reasons.push("Sensitive file access");
        return {
          level: RiskLevel.High,
          reasons,
          overrideRule: "sensitiveFileAccess",
        };
    }

    return { level: RiskLevel.Low, reasons };
  }

  /**
   * Check terminal command against whitelist/blacklist rules
   */
  private checkTerminalRules(
    command: string,
    whitelist: TerminalRule[],
    blacklist: TerminalRule[],
  ): RiskAnalysisResult | null {
    const logger = getLogger();
    const normalizedCommand = command.trim().toLowerCase();

    // Check blacklist first (deny takes priority)
    for (const rule of blacklist) {
      if (
        this.matchTerminalPattern(normalizedCommand, rule.pattern.toLowerCase())
      ) {
        logger.info(
          `Terminal command matched blacklist pattern: ${rule.pattern}`,
        );
        return {
          level: RiskLevel.High,
          reasons: [
            `Terminal command matches blacklisted pattern: ${rule.pattern}`,
          ],
          overrideRule: "terminalCommand",
        };
      }
    }

    // Check whitelist
    for (const rule of whitelist) {
      if (
        this.matchTerminalPattern(normalizedCommand, rule.pattern.toLowerCase())
      ) {
        logger.info(
          `Terminal command matched whitelist pattern: ${rule.pattern}`,
        );
        return {
          level: RiskLevel.Low,
          reasons: [
            `Terminal command matches whitelisted pattern: ${rule.pattern}`,
          ],
        };
      }
    }

    // No match found — let default risk analysis continue
    return null;
  }

  /**
   * Match a terminal command against a pattern
   * Supports glob-style wildcards and basic regex
   */
  private matchTerminalPattern(command: string, pattern: string): boolean {
    // Exact match
    if (command === pattern) {
      return true;
    }

    // Prefix match (e.g., "npm *" matches "npm test")
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      if (command.startsWith(prefix)) {
        return true;
      }
    }

    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");

    try {
      return new RegExp(`^${regexPattern}$`, "i").test(command);
    } catch {
      return false;
    }
  }

  /**
   * Check conditional rules for path-based overrides
   */
  private checkConditionalRules(
    action: ActionContext,
    rules: ConditionalRule[],
  ): RiskAnalysisResult | null {
    if (!rules || rules.length === 0) {
      return null;
    }

    const logger = getLogger();

    for (const rule of rules) {
      // Check adapter name filter
      if (
        rule.adapterName &&
        rule.adapterName.toLowerCase() !== action.adapterName.toLowerCase()
      ) {
        continue;
      }

      // Check action type filter
      if (rule.actionType && rule.actionType !== action.type) {
        continue;
      }

      // Check file pattern match
      if (action.files && action.files.length > 0) {
        for (const file of action.files) {
          if (this.matchGlobPattern(file, rule.pattern)) {
            logger.info(
              `Conditional rule matched: ${rule.pattern} -> ${rule.policy} for ${file}`,
            );

            let level: RiskLevel;
            switch (rule.policy) {
              case ApprovalState.Allow:
                level = RiskLevel.Low;
                break;
              case ApprovalState.Ask:
                level = RiskLevel.Medium;
                break;
              case ApprovalState.Deny:
                level = RiskLevel.High;
                break;
            }

            return {
              level,
              reasons: [`Conditional rule: ${rule.pattern} -> ${rule.policy}`],
            };
          }
        }
      }

      // If no files in action, check if pattern matches action type description
      if (!action.files || action.files.length === 0) {
        if (rule.pattern === "*" || rule.pattern === "**") {
          logger.info(
            `Conditional rule (catch-all) matched: ${rule.pattern} -> ${rule.policy}`,
          );

          let level: RiskLevel;
          switch (rule.policy) {
            case ApprovalState.Allow:
              level = RiskLevel.Low;
              break;
            case ApprovalState.Ask:
              level = RiskLevel.Medium;
              break;
            case ApprovalState.Deny:
              level = RiskLevel.High;
              break;
          }

          return {
            level,
            reasons: [
              `Conditional rule (catch-all): ${rule.pattern} -> ${rule.policy}`,
            ],
          };
        }
      }
    }

    return null;
  }

  /**
   * Check if action involves sensitive files
   * Enhancement 13: Uses improved pattern matching with fewer false positives
   */
  private isSensitivePath(action: ActionContext): boolean {
    if (!action.files || action.files.length === 0) {
      return false;
    }

    const settings = getSettings();
    const patterns = settings.sensitiveFilePatterns;

    for (const file of action.files) {
      for (const pattern of patterns) {
        if (this.matchGlobPattern(file, pattern)) {
          getLogger().debug(
            `Sensitive file match: ${file} matches pattern ${pattern}`,
          );
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if a file path matches a glob pattern
   * Enhancement 13: Improved matching using VS Code's RelativePattern where possible
   */
  private matchGlobPattern(filePath: string, pattern: string): boolean {
    // Normalize paths for comparison
    const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();
    const normalizedPattern = pattern.replace(/\\/g, "/").toLowerCase();

    // Handle ** recursive matching
    if (normalizedPattern.includes("**")) {
      return this.matchRecursivePattern(normalizedPath, normalizedPattern);
    }

    // Handle simple glob patterns
    return this.matchSimpleGlob(normalizedPath, normalizedPattern);
  }

  /**
   * Match a pattern with ** wildcards
   */
  private matchRecursivePattern(path: string, pattern: string): boolean {
    const parts = pattern.split("/");
    let pathIndex = 0;
    const pathParts = path.split("/");

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (part === "**") {
        // ** can match zero or more directories
        if (i === parts.length - 1) {
          // ** at the end matches everything
          return true;
        }
        // Find the next non-** part
        let nextIndex = i + 1;
        while (nextIndex < parts.length && parts[nextIndex] === "**") {
          nextIndex++;
        }

        // Skip path segments until we match the next part
        while (pathIndex < pathParts.length) {
          const nextPart = parts[nextIndex];
          if (this.matchSimpleGlobPart(pathParts[pathIndex], nextPart)) {
            pathIndex++;
            i = nextIndex - 1;
            break;
          }
          pathIndex++;
        }
      } else if (pathIndex >= pathParts.length) {
        return false;
      } else if (!this.matchSimpleGlobPart(pathParts[pathIndex], part)) {
        return false;
      } else {
        pathIndex++;
      }
    }

    return pathIndex >= pathParts.length;
  }

  /**
   * Match a simple glob pattern (no **)
   */
  private matchSimpleGlob(path: string, pattern: string): boolean {
    const parts = pattern.split("/");
    const pathParts = path.split("/");

    if (parts.length !== pathParts.length) {
      return false;
    }

    for (let i = 0; i < parts.length; i++) {
      if (!this.matchSimpleGlobPart(pathParts[i], parts[i])) {
        return false;
      }
    }

    return true;
  }

  /**
   * Match a single glob part (handles * wildcard)
   */
  private matchSimpleGlobPart(pathPart: string, patternPart: string): boolean {
    if (patternPart === "*") {
      return !pathPart.includes("/");
    }

    // Handle multiple wildcards using regex
    const regexPattern = patternPart
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");

    try {
      return new RegExp(`^${regexPattern}$`, "i").test(pathPart);
    } catch {
      return false;
    }
  }

  /**
   * Check if action is destructive
   */
  private isDestructiveAction(action: ActionContext): boolean {
    // Check terminal commands for destructive patterns
    if (action.type === ActionType.TerminalCommand && action.command) {
      const command = action.command.toLowerCase();
      const destructivePatterns = [
        "rm -rf",
        "rm -r",
        "rm /",
        "rm -fr",
        "rm -f /*",
        "del /",
        "deltree",
        "rmtree",
        "chmod -r 777",
        "chown -r",
        "dd if=",
        "mkfs",
        "format",
        "fdisk",
        "--no-preserve-root",
        "sudo rm",
        "> /dev/",
        "shutdown",
        "reboot",
        "halt",
        "poweroff",
      ];

      for (const pattern of destructivePatterns) {
        if (command.includes(pattern)) {
          return true;
        }
      }
    }

    // Check for delete file actions
    if (action.type === ActionType.DeleteFiles) {
      return true;
    }

    return false;
  }

  /**
   * Check if action accesses external directories
   */
  private isExternalDirectoryAccess(action: ActionContext): boolean {
    if (
      action.type !== ActionType.ExternalDirectoryAccess &&
      action.type !== ActionType.ReadFiles
    ) {
      return false;
    }

    if (!action.files || action.files.length === 0) {
      return false;
    }

    // Check if any file is outside workspace
    return !action.isWorkspaceFile;
  }

  /**
   * Check if a path is within the workspace
   */
  public isPathInWorkspace(filePath: string): boolean {
    // Check cache first
    const cached = this.pathCache.get(filePath);
    if (cached !== undefined) {
      return cached;
    }

    // Check against workspace folders
    const normalizedPath = this.normalizePath(filePath);

    for (const folder of this.workspaceFolders) {
      const folderPath = this.normalizePath(folder.uri.fsPath);
      if (
        normalizedPath.startsWith(folderPath + "/") ||
        normalizedPath === folderPath
      ) {
        this.pathCache.set(filePath, true);
        return true;
      }
    }

    this.pathCache.set(filePath, false);
    return false;
  }

  /**
   * Normalize a file path for comparison
   */
  private normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  }

  /**
   * Determine final risk level from accumulated reasons
   */
  private determineRiskLevel(
    reasons: string[],
    typeResult: RiskAnalysisResult,
  ): RiskAnalysisResult {
    // High risk reasons
    const highRiskIndicators = [
      "destructive",
      "terminal command",
      "browser automation",
      "mcp tool",
      "external directory",
      "sensitive file",
      "deleting",
    ];

    for (const reason of reasons) {
      const lowerReason = reason.toLowerCase();
      for (const indicator of highRiskIndicators) {
        if (lowerReason.includes(indicator)) {
          return {
            level: RiskLevel.High,
            reasons,
            overrideRule: typeResult.overrideRule,
          };
        }
      }
    }

    // Medium risk reasons
    const mediumRiskIndicators = [
      "outside workspace",
      "multiple files",
      "creating",
      "renaming",
    ];

    for (const reason of reasons) {
      const lowerReason = reason.toLowerCase();
      for (const indicator of mediumRiskIndicators) {
        if (lowerReason.includes(indicator)) {
          return {
            level: RiskLevel.Medium,
            reasons,
            overrideRule: typeResult.overrideRule,
          };
        }
      }
    }

    // Default to low risk
    return { level: RiskLevel.Low, reasons };
  }

  /**
   * Map risk level to approval state based on settings
   */
  public riskToApprovalState(risk: RiskAnalysisResult): ApprovalState {
    const settings = getSettings();

    // Check for override rule
    if (risk.overrideRule) {
      return settings.getActionRule(risk.overrideRule);
    }

    // Map by risk level
    switch (risk.level) {
      case RiskLevel.Low:
        return ApprovalState.Allow;
      case RiskLevel.Medium:
        return ApprovalState.Ask;
      case RiskLevel.High:
        return ApprovalState.Deny;
      default:
        return settings.defaultPolicy;
    }
  }

  /**
   * Create a quick risk analysis without full context
   */
  public quickAnalyze(
    type: ActionType,
    files?: string[],
    command?: string,
  ): RiskAnalysisResult {
    const action: ActionContext = {
      id: "quick-" + Date.now(),
      type,
      description: this.getActionDescription(type),
      files,
      command,
      isWorkspaceFile: files
        ? files.every((f) => this.isPathInWorkspace(f))
        : false,
      isSensitiveFile: files ? this.isSensitiveFileList(files) : false,
      adapterName: "unknown",
      timestamp: new Date(),
      riskLevel: RiskLevel.Low,
      requiredApproval: ApprovalState.Allow,
    };

    return this.analyze(action);
  }

  /**
   * Check if a list of files are sensitive
   */
  private isSensitiveFileList(files: string[]): boolean {
    for (const file of files) {
      if (this.isSensitivePath({ files: [file] } as ActionContext)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get a description for an action type
   */
  private getActionDescription(type: ActionType): string {
    const descriptions: Record<ActionType, string> = {
      [ActionType.ReadFiles]: "Reading files from workspace",
      [ActionType.EditFiles]: "Editing files in workspace",
      [ActionType.CreateFiles]: "Creating new files in workspace",
      [ActionType.DeleteFiles]: "Deleting files from workspace",
      [ActionType.RenameFiles]: "Renaming files in workspace",
      [ActionType.TerminalCommand]: "Executing terminal command",
      [ActionType.BrowserTool]: "Using browser automation",
      [ActionType.McpToolAccess]: "Accessing MCP tools",
      [ActionType.ExternalDirectoryAccess]: "Accessing external directories",
      [ActionType.SensitiveFileAccess]: "Accessing sensitive files",
    };
    return descriptions[type] || "Unknown action";
  }

  /**
   * Test if a file path matches a given glob pattern
   * Used by the "Test Pattern" command
   */
  public testPattern(filePath: string, pattern: string): boolean {
    return this.matchGlobPattern(filePath, pattern);
  }

  /**
   * Clear the path cache
   */
  public clearCache(): void {
    this.pathCache.clear();
  }

  /**
   * Dispose the risk analyzer
   */
  public dispose(): void {
    this.pathCache.clear();
    (RiskAnalyzer as unknown as { instance?: RiskAnalyzer }).instance =
      undefined;
  }
}

/**
 * Helper to get risk analyzer instance
 */
export function getRiskAnalyzer(): RiskAnalyzer {
  return RiskAnalyzer.getInstance();
}
