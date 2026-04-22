import * as vscode from "vscode";
import { BatchStatus, ApprovalState, RiskLevel, TreeItemType } from "./types";
import { getApprovalEngine } from "./approvalEngine";
import { getAdapterRegistry } from "./adapterRegistry";

/**
 * Tree data provider for the OmniAccept sidebar view
 */
export class OmniAcceptTreeDataProvider implements vscode.TreeDataProvider<OmniAcceptTreeItem> {
  private static instance: OmniAcceptTreeDataProvider;
  private changeEmitter: vscode.EventEmitter<
    OmniAcceptTreeItem | undefined | null
  > = new vscode.EventEmitter();
  private disposables: vscode.Disposable[] = [];

  public readonly onDidChangeTreeData: vscode.Event<
    OmniAcceptTreeItem | undefined | null
  > = this.changeEmitter.event;

  private constructor() {
    // Refresh on approval engine events
    const engine = getApprovalEngine();
    engine.onAction(() => this.refresh());
    engine.onApproval(() => this.refresh());
    engine.onRejection(() => this.refresh());
    engine.onBatchEvent(() => this.refresh());
  }

  public static getInstance(): OmniAcceptTreeDataProvider {
    if (!OmniAcceptTreeDataProvider.instance) {
      OmniAcceptTreeDataProvider.instance = new OmniAcceptTreeDataProvider();
    }
    return OmniAcceptTreeDataProvider.instance;
  }

  /**
   * Refresh the tree view
   */
  public refresh(): void {
    this.changeEmitter.fire(undefined);
  }

  /**
   * Get tree item for an element
   */
  public getTreeItem(element: OmniAcceptTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children of an element
   */
  public getChildren(element?: OmniAcceptTreeItem): OmniAcceptTreeItem[] {
    if (!element) {
      return this.getRootItems();
    }

    switch (element.itemType) {
      case TreeItemType.Adapter:
        return this.getAdapterChildren(element);
      case TreeItemType.PendingAction:
        return [];
      case TreeItemType.BatchHistory:
        return this.getBatchHistoryChildren();
      case TreeItemType.BatchEntry:
        return this.getBatchEntryChildren(element);
      default:
        return [];
    }
  }

  /**
   * Get root-level items
   */
  private getRootItems(): OmniAcceptTreeItem[] {
    const items: OmniAcceptTreeItem[] = [];

    // Active Adapter section
    const registry = getAdapterRegistry();
    const activeAdapter = registry.getActiveAdapter();
    if (activeAdapter) {
      items.push(
        new OmniAcceptTreeItem(
          `🔌 ${activeAdapter.name}`,
          vscode.TreeItemCollapsibleState.Expanded,
          TreeItemType.Adapter,
          {
            description: "Active",
            iconPath: new vscode.ThemeIcon("plug"),
            contextValue: "adapter",
          },
        ),
      );
    } else {
      items.push(
        new OmniAcceptTreeItem(
          "🔌 No Active Adapter",
          vscode.TreeItemCollapsibleState.None,
          TreeItemType.Adapter,
          {
            description: "Inactive",
            iconPath: new vscode.ThemeIcon("warning"),
            contextValue: "adapter-inactive",
          },
        ),
      );
    }

    // Pending Actions section
    const engine = getApprovalEngine();
    const pendingCount = engine.getPendingCount();
    items.push(
      new OmniAcceptTreeItem(
        `⏳ Pending Actions (${pendingCount})`,
        pendingCount > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None,
        TreeItemType.PendingAction,
        {
          iconPath:
            pendingCount > 0
              ? new vscode.ThemeIcon("clock")
              : new vscode.ThemeIcon("check"),
          contextValue: "pending-actions",
        },
      ),
    );

    // Recent Batches section
    const batchHistory = engine.getBatchHistory();
    items.push(
      new OmniAcceptTreeItem(
        `📋 Recent Batches (${Math.min(batchHistory.length, 10)})`,
        batchHistory.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        TreeItemType.BatchHistory,
        {
          iconPath: new vscode.ThemeIcon("history"),
          contextValue: "batch-history",
        },
      ),
    );

    return items;
  }

  /**
   * Get children for adapter section
   */
  private getAdapterChildren(
    _element: OmniAcceptTreeItem,
  ): OmniAcceptTreeItem[] {
    const items: OmniAcceptTreeItem[] = [];
    const registry = getAdapterRegistry();
    const activeAdapter = registry.getActiveAdapter();

    if (activeAdapter) {
      const status = activeAdapter.getAdapterStatus();
      items.push(
        new OmniAcceptTreeItem(
          `Status: ${status.isActive ? "✅ Active" : "❌ Inactive"}`,
          vscode.TreeItemCollapsibleState.None,
          TreeItemType.Adapter,
          { contextValue: "adapter-status" },
        ),
      );
      items.push(
        new OmniAcceptTreeItem(
          `Version: ${status.version}`,
          vscode.TreeItemCollapsibleState.None,
          TreeItemType.Adapter,
          { contextValue: "adapter-version" },
        ),
      );
      items.push(
        new OmniAcceptTreeItem(
          `Pending: ${status.pendingActionsCount}`,
          vscode.TreeItemCollapsibleState.None,
          TreeItemType.Adapter,
          { contextValue: "adapter-pending" },
        ),
      );
    }

    // Show all registered adapters
    const allAdapters = registry.getAllAdapters();
    for (const adapter of allAdapters) {
      const isActive = activeAdapter?.name === adapter.name;
      items.push(
        new OmniAcceptTreeItem(
          `${isActive ? "→ " : "  "}${adapter.name}`,
          vscode.TreeItemCollapsibleState.None,
          TreeItemType.Adapter,
          {
            description: isActive ? "active" : "available",
            contextValue: isActive ? "adapter-active" : "adapter-available",
          },
        ),
      );
    }

    return items;
  }

  /**
   * Get children for batch history section
   */
  private getBatchHistoryChildren(): OmniAcceptTreeItem[] {
    const engine = getApprovalEngine();
    const batches = engine.getBatchHistory().slice(0, 10);

    return batches.map((batch) => {
      const statusIcon = this.getBatchStatusIcon(batch.status);
      const actionCount = batch.actions.length;
      const timeStr = batch.startTime.toLocaleTimeString();

      return new OmniAcceptTreeItem(
        `${statusIcon} ${batch.adapterName} (${actionCount})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        TreeItemType.BatchEntry,
        {
          description: timeStr,
          contextValue: "batch-entry",
          batchId: batch.id,
        },
      );
    });
  }

  /**
   * Get children for a batch entry
   */
  private getBatchEntryChildren(
    element: OmniAcceptTreeItem,
  ): OmniAcceptTreeItem[] {
    if (!element.batchId) {
      return [];
    }

    const engine = getApprovalEngine();
    const batches = engine.getBatchHistory();
    const batch = batches.find((b) => b.id === element.batchId);

    if (!batch) {
      return [];
    }

    return batch.actions.map((action) => {
      const riskIcon = this.getRiskIcon(action.riskLevel);
      const approvalIcon = this.getApprovalIcon(action.requiredApproval);

      return new OmniAcceptTreeItem(
        `${riskIcon} ${action.type}`,
        vscode.TreeItemCollapsibleState.None,
        TreeItemType.PendingAction,
        {
          description: `${approvalIcon} ${action.description.substring(0, 40)}`,
          contextValue: "action-entry",
        },
      );
    });
  }

  /**
   * Get icon for batch status
   */
  private getBatchStatusIcon(status: BatchStatus): string {
    switch (status) {
      case BatchStatus.Approved:
        return "✅";
      case BatchStatus.Rejected:
        return "❌";
      case BatchStatus.PartiallyApproved:
        return "⚠️";
      case BatchStatus.Pending:
        return "⏳";
      default:
        return "❓";
    }
  }

  /**
   * Get icon for risk level
   */
  private getRiskIcon(level: RiskLevel): string {
    switch (level) {
      case RiskLevel.Low:
        return "🟢";
      case RiskLevel.Medium:
        return "🟡";
      case RiskLevel.High:
        return "🔴";
      default:
        return "⚪";
    }
  }

  /**
   * Get icon for approval state
   */
  private getApprovalIcon(state: ApprovalState): string {
    switch (state) {
      case ApprovalState.Allow:
        return "✅";
      case ApprovalState.Ask:
        return "❓";
      case ApprovalState.Deny:
        return "🚫";
      default:
        return "⚪";
    }
  }

  public dispose(): void {
    this.changeEmitter.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}

/**
 * Custom tree item for OmniAccept sidebar
 */
export class OmniAcceptTreeItem extends vscode.TreeItem {
  public itemType: TreeItemType;
  public batchId?: string;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    itemType: TreeItemType,
    options?: {
      description?: string;
      iconPath?: vscode.ThemeIcon;
      contextValue?: string;
      batchId?: string;
    },
  ) {
    super(label, collapsibleState);
    this.itemType = itemType;

    if (options?.description) {
      this.description = options.description;
    }
    if (options?.iconPath) {
      this.iconPath = options.iconPath;
    }
    if (options?.contextValue) {
      this.contextValue = options.contextValue;
    }
    if (options?.batchId) {
      this.batchId = options.batchId;
    }
  }
}

/**
 * Get the OmniAcceptTreeDataProvider singleton
 */
export function getTreeDataProvider(): OmniAcceptTreeDataProvider {
  return OmniAcceptTreeDataProvider.getInstance();
}
