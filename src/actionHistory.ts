import * as vscode from "vscode";
import {
  ActionHistoryEntry,
  ApprovalState,
  ApprovalAnalytics,
  ActionType,
} from "./types";
import { getLogger } from "./logger";

/**
 * Manages action history and provides analytics
 * Persists history to globalState for survival across sessions
 */
export class ActionHistory implements vscode.Disposable {
  private static instance: ActionHistory;
  private history: ActionHistoryEntry[] = [];
  private maxHistorySize: number = 500;
  private context: vscode.ExtensionContext | null = null;
  private readonly storageKey = "omniAccept.actionHistory";

  private constructor() {}

  public static getInstance(): ActionHistory {
    if (!ActionHistory.instance) {
      ActionHistory.instance = new ActionHistory();
    }
    return ActionHistory.instance;
  }

  /**
   * Initialize with extension context for persistence
   */
  public initialize(
    context: vscode.ExtensionContext,
    maxHistorySize: number,
  ): void {
    this.context = context;
    this.maxHistorySize = maxHistorySize;
    this.loadFromStorage();
    getLogger().info(
      `Action history initialized with ${this.history.length} entries`,
    );
  }

  /**
   * Load history from globalState persistence
   */
  private loadFromStorage(): void {
    if (!this.context) {
      return;
    }

    try {
      const stored = this.context.globalState.get<string[]>(this.storageKey);
      if (stored && Array.isArray(stored)) {
        this.history = stored.map((entry: string) => {
          const parsed = JSON.parse(entry);
          return {
            ...parsed,
            timestamp: new Date(parsed.timestamp),
          };
        });
      }
    } catch (error) {
      getLogger().error(`Failed to load action history: ${error}`);
      this.history = [];
    }
  }

  /**
   * Persist history to globalState
   */
  private async saveToStorage(): Promise<void> {
    if (!this.context) {
      return;
    }

    try {
      const serialized = this.history.map((entry) =>
        JSON.stringify({
          ...entry,
          timestamp: entry.timestamp.toISOString(),
        }),
      );
      await this.context.globalState.update(this.storageKey, serialized);
    } catch (error) {
      getLogger().error(`Failed to save action history: ${error}`);
    }
  }

  /**
   * Record an action decision
   */
  public async recordEntry(entry: ActionHistoryEntry): Promise<void> {
    this.history.unshift(entry);

    // Trim to max size
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize);
    }

    await this.saveToStorage();
    getLogger().debug(
      `History entry recorded: ${entry.actionType} -> ${entry.decision}`,
    );
  }

  /**
   * Get all history entries
   */
  public getHistory(): ActionHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Get recent history entries
   */
  public getRecentHistory(count: number = 50): ActionHistoryEntry[] {
    return this.history.slice(0, count);
  }

  /**
   * Get history filtered by action type
   */
  public getHistoryByType(actionType: ActionType): ActionHistoryEntry[] {
    return this.history.filter((entry) => entry.actionType === actionType);
  }

  /**
   * Get history filtered by adapter
   */
  public getHistoryByAdapter(adapterName: string): ActionHistoryEntry[] {
    return this.history.filter((entry) => entry.adapterName === adapterName);
  }

  /**
   * Get history filtered by decision
   */
  public getHistoryByDecision(decision: ApprovalState): ActionHistoryEntry[] {
    return this.history.filter((entry) => entry.decision === decision);
  }

  /**
   * Get history within a date range
   */
  public getHistoryByDateRange(start: Date, end: Date): ActionHistoryEntry[] {
    return this.history.filter(
      (entry) => entry.timestamp >= start && entry.timestamp <= end,
    );
  }

  /**
   * Compute analytics from history
   */
  public getAnalytics(): ApprovalAnalytics {
    const analytics: ApprovalAnalytics = {
      totalActions: this.history.length,
      approved: 0,
      denied: 0,
      asked: 0,
      byActionType: {},
      byAdapter: {},
      averageResponseTimeMs: 0,
    };

    let totalResponseTime = 0;
    let responseTimeCount = 0;

    for (const entry of this.history) {
      // Count by decision
      switch (entry.decision) {
        case ApprovalState.Allow:
          analytics.approved++;
          break;
        case ApprovalState.Deny:
          analytics.denied++;
          break;
        case ApprovalState.Ask:
          analytics.asked++;
          break;
      }

      // Count by action type
      if (!analytics.byActionType[entry.actionType]) {
        analytics.byActionType[entry.actionType] = {
          approved: 0,
          denied: 0,
          asked: 0,
        };
      }
      const typeStats = analytics.byActionType[entry.actionType];
      switch (entry.decision) {
        case ApprovalState.Allow:
          typeStats.approved++;
          break;
        case ApprovalState.Deny:
          typeStats.denied++;
          break;
        case ApprovalState.Ask:
          typeStats.asked++;
          break;
      }

      // Count by adapter
      analytics.byAdapter[entry.adapterName] =
        (analytics.byAdapter[entry.adapterName] || 0) + 1;

      // Average response time
      if (entry.responseTimeMs !== undefined) {
        totalResponseTime += entry.responseTimeMs;
        responseTimeCount++;
      }
    }

    analytics.averageResponseTimeMs =
      responseTimeCount > 0
        ? Math.round(totalResponseTime / responseTimeCount)
        : 0;

    return analytics;
  }

  /**
   * Clear all history
   */
  public async clearHistory(): Promise<void> {
    this.history = [];
    await this.saveToStorage();
    getLogger().info("Action history cleared");
  }

  /**
   * Export history as JSON string
   */
  public exportHistory(): string {
    return JSON.stringify(this.history, null, 2);
  }

  /**
   * Get history count
   */
  public get count(): number {
    return this.history.length;
  }

  /**
   * Update max history size
   */
  public setMaxHistorySize(size: number): void {
    this.maxHistorySize = size;
    if (this.history.length > size) {
      this.history = this.history.slice(0, size);
    }
  }

  public dispose(): void {
    this.history = [];
  }
}

/**
 * Get the ActionHistory singleton
 */
export function getActionHistory(): ActionHistory {
  return ActionHistory.getInstance();
}
