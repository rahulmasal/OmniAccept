import * as vscode from "vscode";
import { getLogger } from "./logger";
import { getSettings } from "./settings";
import { getApprovalEngine } from "./approvalEngine";
import { getAdapterRegistry } from "./adapterRegistry";
import { getActionHistory } from "./actionHistory";
import { getWorkspaceConfigLoader } from "./workspaceConfig";
import { getSettingsValidator } from "./settingsValidator";
import { getRiskAnalyzer } from "./riskAnalyzer";
import { showDiffPreview } from "./diffPreview";
import { ApprovalState, TelemetryEvent } from "./types";
import { getTelemetry } from "./telemetry";

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
      vscode.commands.registerCommand(
        "universalAutoAccept.toggleEnabled",
        async () => {
          await this.toggleEnabled();
        },
      ),
    );

    // Open settings
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.openSettings",
        async () => {
          await this.openSettings();
        },
      ),
    );

    // Approve current batch
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.approveCurrentBatch",
        async () => {
          await this.approveCurrentBatch();
        },
      ),
    );

    // Reject current batch
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.rejectCurrentBatch",
        async () => {
          await this.rejectCurrentBatch();
        },
      ),
    );

    // Show active adapter
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.showActiveAdapter",
        async () => {
          await this.showActiveAdapter();
        },
      ),
    );

    // Rescan adapters
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.rescanAdapters",
        async () => {
          await this.rescanAdapters();
        },
      ),
    );

    // Undo last batch
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.undoLastBatch",
        async () => {
          await this.undoLastBatch();
        },
      ),
    );

    // Show diff preview
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.showDiffPreview",
        async () => {
          this.showDiffPreviewInternal();
        },
      ),
    );

    // Show action history
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.showHistory",
        async () => {
          await this.showHistory();
        },
      ),
    );

    // Clear action history
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.clearHistory",
        async () => {
          await this.clearHistory();
        },
      ),
    );

    // Export action history
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.exportHistory",
        async () => {
          await this.exportHistory();
        },
      ),
    );

    // Show analytics
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.showAnalytics",
        async () => {
          await this.showAnalytics();
        },
      ),
    );

    // Scaffold workspace config
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.scaffoldWorkspaceConfig",
        async () => {
          await this.scaffoldWorkspaceConfig();
        },
      ),
    );

    // Open workspace config
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.openWorkspaceConfig",
        async () => {
          await this.openWorkspaceConfig();
        },
      ),
    );

    // Validate settings
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.validateSettings",
        async () => {
          await this.validateSettings();
        },
      ),
    );

    // Reset settings to defaults
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.resetSettings",
        async () => {
          await this.resetSettings();
        },
      ),
    );

    // Test pattern
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.testPattern",
        async () => {
          await this.testPattern();
        },
      ),
    );

    // Reset session budget
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.resetSessionBudget",
        async () => {
          await this.resetSessionBudget();
        },
      ),
    );

    // Refresh tree view
    this.disposables.push(
      vscode.commands.registerCommand(
        "universalAutoAccept.refreshTreeView",
        async () => {
          vscode.commands.executeCommand(
            "universalAutoAccept.explorer.refresh",
          );
        },
      ),
    );

    logger.info("All commands registered");
  }

  /**
   * Toggle extension enabled state
   */
  public async toggleEnabled(): Promise<void> {
    const logger = getLogger();
    const settings = getSettings();

    const newState = !settings.enabled;
    await settings.setEnabled(newState);

    logger.info(`Extension ${newState ? "enabled" : "disabled"}`);

    getTelemetry().sendEvent(TelemetryEvent.ModeChanged, {
      mode: newState ? "on" : "off",
    });

    vscode.window
      .showInformationMessage(
        `Universal Auto Accept is now ${newState ? "ON" : "OFF"}`,
        "Open Settings",
      )
      .then((choice: string | undefined) => {
        if (choice === "Open Settings") {
          this.openSettings();
        }
      });
  }

  /**
   * Open extension settings
   */
  public async openSettings(): Promise<void> {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "universalAutoAccept",
    );
  }

  /**
   * Approve all pending actions in the current batch
   */
  public async approveCurrentBatch(): Promise<boolean> {
    const logger = getLogger();
    const approvalEngine = getApprovalEngine();

    if (!approvalEngine.hasPendingActions()) {
      vscode.window.showInformationMessage("No pending actions to approve");
      return false;
    }

    const batch = approvalEngine.getCurrentBatch();
    if (!batch) {
      vscode.window.showInformationMessage("No current batch to approve");
      return false;
    }

    const result = await vscode.window.showInformationMessage(
      `Approve ${batch.actions.length} action(s)?`,
      "Approve",
      "Cancel",
    );

    if (result === "Approve") {
      const success = await approvalEngine.approveCurrentBatch();
      if (success) {
        logger.info("Batch approved by user");
        vscode.window.showInformationMessage("All pending actions approved");
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
      vscode.window.showInformationMessage("No pending actions to reject");
      return false;
    }

    const batch = approvalEngine.getCurrentBatch();
    if (!batch) {
      vscode.window.showInformationMessage("No current batch to reject");
      return false;
    }

    const result = await vscode.window.showInformationMessage(
      `Reject ${batch.actions.length} action(s)?`,
      "Reject",
      "Cancel",
    );

    if (result === "Reject") {
      const success = await approvalEngine.rejectCurrentBatch();
      if (success) {
        logger.info("Batch rejected by user");
        vscode.window.showInformationMessage("All pending actions rejected");
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
      vscode.window.showInformationMessage("No active adapter found");
      return;
    }

    const status = activeAdapter.getAdapterStatus();
    const message = [
      `Adapter: ${status.name}`,
      `Version: ${status.version}`,
      `Active: ${status.isActive ? "Yes" : "No"}`,
      `Enabled: ${status.isEnabled ? "Yes" : "No"}`,
      `Pending Actions: ${status.pendingActionsCount}`,
      status.lastActivity
        ? `Last Activity: ${status.lastActivity.toLocaleString()}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    vscode.window
      .showInformationMessage(message, "Rescan", "Close")
      .then((choice: string | undefined) => {
        if (choice === "Rescan") {
          this.rescanAdapters();
        }
      });
  }

  /**
   * Rescan for available adapters
   */
  public async rescanAdapters(): Promise<void> {
    const logger = getLogger();
    const registry = getAdapterRegistry();

    logger.info("Rescanning adapters...");
    await registry.scanForAdapters();
    registry.selectActiveAdapter();

    const adapters = registry.getAllAdapters();
    const activeAdapter = registry.getActiveAdapter();

    vscode.window.showInformationMessage(
      `Found ${adapters.length} adapter(s). Active: ${activeAdapter?.name || "None"}`,
    );

    getTelemetry().sendEvent(TelemetryEvent.AdapterDetected, {
      count: String(adapters.length),
      active: activeAdapter?.name || "none",
    });
  }

  /**
   * Undo the last approved batch
   */
  public async undoLastBatch(): Promise<boolean> {
    const approvalEngine = getApprovalEngine();

    if (!approvalEngine.hasUndoHistory()) {
      vscode.window.showInformationMessage("No actions to undo");
      return false;
    }

    const result = await vscode.window.showWarningMessage(
      "Undo the last approved batch? This will attempt to revert all changes.",
      "Undo",
      "Cancel",
    );

    if (result === "Undo") {
      const success = await approvalEngine.undoLastBatch();
      if (success) {
        vscode.window.showInformationMessage("Last batch has been undone");
      } else {
        vscode.window.showErrorMessage("Failed to undo last batch");
      }
      return success;
    }

    return false;
  }

  /**
   * Show diff preview
   */
  public showDiffPreviewInternal(): void {
    const approvalEngine = getApprovalEngine();
    const batch = approvalEngine.getCurrentBatch();

    if (!batch) {
      vscode.window.showInformationMessage("No current batch to preview");
      return;
    }

    showDiffPreview(batch);
    getTelemetry().sendEvent(TelemetryEvent.DiffPreviewOpened);
  }

  /**
   * Show action history
   */
  public async showHistory(): Promise<void> {
    const history = getActionHistory();
    const entries = history.getRecentHistory(50);

    if (entries.length === 0) {
      vscode.window.showInformationMessage("No action history available");
      return;
    }

    const items = entries.map((entry) => ({
      label: `${this.getDecisionIcon(entry.decision)} ${entry.actionType}`,
      description: entry.description.substring(0, 60),
      detail: `Adapter: ${entry.adapterName} | Risk: ${entry.riskLevel} | ${entry.timestamp.toLocaleString()}`,
      entry,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "Action History",
      matchOnDescription: true,
    });

    if (picked) {
      // Show details of the selected entry
      const details = [
        `ID: ${picked.entry.id}`,
        `Type: ${picked.entry.actionType}`,
        `Description: ${picked.entry.description}`,
        `Decision: ${picked.entry.decision}`,
        `Risk Level: ${picked.entry.riskLevel}`,
        `Adapter: ${picked.entry.adapterName}`,
        `Time: ${picked.entry.timestamp.toLocaleString()}`,
        picked.entry.files?.length
          ? `Files: ${picked.entry.files.join(", ")}`
          : "",
        picked.entry.responseTimeMs
          ? `Response Time: ${picked.entry.responseTimeMs}ms`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      vscode.window.showInformationMessage(details, { modal: true }, "Close");
    }
  }

  /**
   * Clear action history
   */
  public async clearHistory(): Promise<void> {
    const result = await vscode.window.showWarningMessage(
      "Clear all action history? This cannot be undone.",
      "Clear",
      "Cancel",
    );

    if (result === "Clear") {
      await getActionHistory().clearHistory();
      vscode.window.showInformationMessage("Action history cleared");
    }
  }

  /**
   * Export action history as JSON
   */
  public async exportHistory(): Promise<void> {
    const history = getActionHistory();
    const json = history.exportHistory();

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file("omniaccept-history.json"),
      filters: { JSON: ["json"] },
    });

    if (uri) {
      const encoder = new TextEncoder();
      await vscode.workspace.fs.writeFile(uri, encoder.encode(json));
      vscode.window.showInformationMessage(`History exported to ${uri.fsPath}`);
    }
  }

  /**
   * Show analytics dashboard
   */
  public async showAnalytics(): Promise<void> {
    const history = getActionHistory();
    const analytics = history.getAnalytics();

    const lines = [
      "📊 Approval Analytics",
      "═══════════════════════",
      `Total Actions: ${analytics.totalActions}`,
      `Approved: ${analytics.approved} (${this.percentage(analytics.approved, analytics.totalActions)}%)`,
      `Denied: ${analytics.denied} (${this.percentage(analytics.denied, analytics.totalActions)}%)`,
      `Asked: ${analytics.asked} (${this.percentage(analytics.asked, analytics.totalActions)}%)`,
      `Avg Response Time: ${analytics.averageResponseTimeMs}ms`,
      "",
      "By Action Type:",
    ];

    for (const [type, stats] of Object.entries(analytics.byActionType)) {
      lines.push(
        `  ${type}: ✅${stats.approved} ❌${stats.denied} ❓${stats.asked}`,
      );
    }

    lines.push("", "By Adapter:");
    for (const [adapter, count] of Object.entries(analytics.byAdapter)) {
      lines.push(`  ${adapter}: ${count} actions`);
    }

    vscode.window.showInformationMessage(
      lines.join("\n"),
      { modal: true },
      "Close",
    );
  }

  /**
   * Scaffold workspace config file
   */
  public async scaffoldWorkspaceConfig(): Promise<void> {
    await getWorkspaceConfigLoader().scaffoldConfig();
  }

  /**
   * Open workspace config file
   */
  public async openWorkspaceConfig(): Promise<void> {
    await getWorkspaceConfigLoader().openConfig();
  }

  /**
   * Validate current settings
   */
  public async validateSettings(): Promise<void> {
    const settings = getSettings();
    const validator = getSettingsValidator();
    const result = validator.validate(settings.settings);

    if (result.isValid && result.warnings.length === 0) {
      vscode.window.showInformationMessage("✅ All settings are valid");
    } else {
      const lines: string[] = [];

      if (result.errors.length > 0) {
        lines.push("❌ Errors:");
        for (const error of result.errors) {
          lines.push(`  ${error.key}: ${error.message}`);
        }
      }

      if (result.warnings.length > 0) {
        lines.push("⚠️ Warnings:");
        for (const warning of result.warnings) {
          lines.push(`  ${warning.key}: ${warning.message}`);
        }
      }

      vscode.window.showWarningMessage(
        lines.join("\n"),
        { modal: true },
        "Close",
      );
    }
  }

  /**
   * Reset settings to defaults
   */
  public async resetSettings(): Promise<void> {
    const result = await vscode.window.showWarningMessage(
      "Reset all settings to defaults? This cannot be undone.",
      "Reset",
      "Cancel",
    );

    if (result === "Reset") {
      await getSettings().resetToDefaults();
      vscode.window.showInformationMessage("Settings reset to defaults");
    }
  }

  /**
   * Test a glob pattern against a file path
   */
  public async testPattern(): Promise<void> {
    const pattern = await vscode.window.showInputBox({
      prompt: "Enter glob pattern to test",
      placeHolder: "**/*.env*",
    });

    if (!pattern) {
      return;
    }

    const filePath = await vscode.window.showInputBox({
      prompt: "Enter file path to test against",
      placeHolder: "/path/to/file.env",
    });

    if (!filePath) {
      return;
    }

    const riskAnalyzer = getRiskAnalyzer();
    const matches = riskAnalyzer.testPattern(filePath, pattern);

    vscode.window.showInformationMessage(
      `Pattern "${pattern}" ${matches ? "✅ MATCHES" : "❌ does NOT match"} path "${filePath}"`,
    );
  }

  /**
   * Reset session auto-approve budget
   */
  public async resetSessionBudget(): Promise<void> {
    getApprovalEngine().resetSessionBudget();
  }

  /**
   * Get icon for approval decision
   */
  private getDecisionIcon(decision: ApprovalState): string {
    switch (decision) {
      case ApprovalState.Allow:
        return "✅";
      case ApprovalState.Deny:
        return "❌";
      case ApprovalState.Ask:
        return "❓";
      default:
        return "⚪";
    }
  }

  /**
   * Calculate percentage
   */
  private percentage(part: number, total: number): string {
    if (total === 0) {
      return "0";
    }
    return Math.round((part / total) * 100).toString();
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}

/**
 * Get the Commands singleton
 */
export function getCommands(): Commands {
  return Commands.getInstance();
}
