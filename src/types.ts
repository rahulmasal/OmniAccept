import * as vscode from "vscode";

/**
 * Action types that the approval engine can handle
 */
export enum ActionType {
  ReadFiles = "readFiles",
  EditFiles = "editFiles",
  CreateFiles = "createFiles",
  DeleteFiles = "deleteFiles",
  RenameFiles = "renameFiles",
  TerminalCommand = "terminalCommand",
  BrowserTool = "browserTool",
  McpToolAccess = "mcpToolAccess",
  ExternalDirectoryAccess = "externalDirectoryAccess",
  SensitiveFileAccess = "sensitiveFileAccess",
}

/**
 * Approval states for actions
 */
export enum ApprovalState {
  Allow = "allow",
  Ask = "ask",
  Deny = "deny",
}

/**
 * Risk levels for actions
 */
export enum RiskLevel {
  Low = "low",
  Medium = "medium",
  High = "high",
}

/**
 * Extension mode for the status bar
 */
export type ExtensionMode = "on" | "ask" | "off";

/**
 * Context information for an action that needs approval
 */
export interface ActionContext {
  id: string;
  type: ActionType;
  description: string;
  files?: string[];
  command?: string;
  isWorkspaceFile: boolean;
  isSensitiveFile: boolean;
  adapterName: string;
  timestamp: Date;
  batchId?: string;
  riskLevel: RiskLevel;
  requiredApproval: ApprovalState;
  originalState?: ApprovalState;
  /** File-level approval state for granular control */
  fileApprovalStates?: Map<string, ApprovalState>;
}

/**
 * Batch of actions for grouped approval/rejection
 */
export interface ActionBatch {
  id: string;
  actions: ActionContext[];
  adapterName: string;
  startTime: Date;
  endTime?: Date;
  status: BatchStatus;
}

export enum BatchStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
  PartiallyApproved = "partiallyApproved",
}

/**
 * Undo entry for reverting changes
 */
export interface UndoEntry {
  batchId: string;
  timestamp: Date;
  changes: FileChange[];
  adapterName: string;
  /** Whether this undo entry was created via git */
  isGitBased?: boolean;
}

export interface FileChange {
  type: "create" | "edit" | "delete" | "rename";
  path: string;
  originalContent?: string;
  newContent?: string;
  originalPath?: string;
}

/**
 * Adapter interface that all AI extension adapters must implement
 */
export interface IAdapter {
  readonly name: string;
  readonly extensionId: string;
  readonly version: string;

  isActive(): boolean;

  isEnabled(): boolean;

  getPendingActions(): Promise<ActionContext[]>;

  approveAction(action: ActionContext): Promise<boolean>;

  rejectAction(action: ActionContext): Promise<boolean>;

  approveBatch(batch: ActionBatch): Promise<boolean>;

  rejectBatch(batch: ActionBatch): Promise<boolean>;

  getAdapterStatus(): AdapterStatus;

  onAction(callback: (action: ActionContext) => void): vscode.Disposable;

  onBatchStart(callback: (batch: ActionBatch) => void): vscode.Disposable;

  onBatchEnd(callback: (batch: ActionBatch) => void): vscode.Disposable;

  dispose(): void;
}

export interface AdapterStatus {
  isActive: boolean;
  isEnabled: boolean;
  name: string;
  version: string;
  pendingActionsCount: number;
  lastActivity?: Date;
}

/**
 * Risk analysis result
 */
export interface RiskAnalysisResult {
  level: RiskLevel;
  reasons: string[];
  overrideRule?: string;
}

/**
 * Settings for the extension
 */
export interface ExtensionSettings {
  enabled: boolean;
  trustedWorkspaceOnly: boolean;
  defaultPolicy: ApprovalState;
  adapterSettings: AdapterSettingsConfig;
  actionRules: ActionRulesConfig;
  conditionalRules: ConditionalRule[];
  terminalWhitelist: TerminalRule[];
  terminalBlacklist: TerminalRule[];
  sensitiveFilePatterns: string[];
  maxUndoBatchSize: number;
  autoApproveDelay: number;
  logLevel: LogLevel;
  statusBarMode: ExtensionMode;
  showNotifications: boolean;
  audioNotifications: boolean;
  audioVolume: number;
  askModeTimeout: number;
  useGitUndo: boolean;
  gitUndoDryRun: boolean;
  maxAutoApprovesPerMinute: number;
  maxAutoApprovesPerSession: number;
  rateLimitAction: RateLimitAction;
  autoApproveBudget: number;
  changeDebounceMs: number;
  maxHistorySize: number;
  ignoreWorkspaceConfig: boolean;
  enableTelemetry: boolean;
  configVersion: number;
}

export interface AdapterSettingsConfig {
  rooCode: boolean;
  kiloCode: boolean;
  cline: boolean;
  cursor: boolean;
  windsurf: boolean;
  continueExt: boolean;
}

export interface ActionRulesConfig {
  readFiles: ApprovalState;
  editFiles: ApprovalState;
  createFiles: ApprovalState;
  deleteFiles: ApprovalState;
  renameFiles: ApprovalState;
  terminalCommand: ApprovalState;
  browserTool: ApprovalState;
  mcpToolAccess: ApprovalState;
  externalDirectoryAccess: ApprovalState;
  sensitiveFileAccess: ApprovalState;
}

export type LogLevel = "off" | "error" | "warn" | "info" | "debug";

export interface ConditionalRule {
  pattern: string;
  policy: ApprovalState;
  actionType?: ActionType;
  /** Optional adapter name to scope the rule to a specific adapter */
  adapterName?: string;
}

export interface TerminalRule {
  pattern: string;
  policy: ApprovalState;
}

export type RateLimitAction = "ask" | "pause" | "off";

export interface WorkspaceConfig {
  actionRules?: Partial<ActionRulesConfig>;
  conditionalRules?: ConditionalRule[];
  terminalWhitelist?: TerminalRule[];
  terminalBlacklist?: TerminalRule[];
  sensitiveFilePatterns?: string[];
}

export interface ActionHistoryEntry {
  id: string;
  actionType: ActionType;
  description: string;
  files?: string[];
  adapterName: string;
  decision: ApprovalState;
  riskLevel: RiskLevel;
  timestamp: Date;
  batchId?: string;
  /** Time in ms from action creation to decision */
  responseTimeMs?: number;
}

export interface ApprovalAnalytics {
  totalActions: number;
  approved: number;
  denied: number;
  asked: number;
  byActionType: Record<
    string,
    { approved: number; denied: number; asked: number }
  >;
  byAdapter: Record<string, number>;
  averageResponseTimeMs: number;
}

/**
 * Webview message types for diff preview
 */
export type DiffPreviewMessage =
  | { type: "approve"; batchId: string }
  | { type: "reject"; batchId: string }
  | { type: "approveFile"; filePath: string; batchId: string }
  | { type: "rejectFile"; filePath: string; batchId: string }
  | { type: "showMore"; offset: number }
  | { type: "ready" };

export interface DiffPreviewState {
  batch: ActionBatch;
  files: FilePreview[];
  /** Per-file approval states for granular control */
  fileApprovalStates: Map<string, ApprovalState>;
}

export interface FilePreview {
  path: string;
  originalContent?: string;
  newContent?: string;
  status: "added" | "modified" | "deleted" | "renamed";
  /** Individual file approval state */
  approvalState?: ApprovalState;
}

/**
 * Event data for adapter events
 */
export interface ActionEventData {
  action: ActionContext;
  adapter: IAdapter;
}

export interface BatchEventData {
  batch: ActionBatch;
  adapter: IAdapter;
}

/**
 * Settings validation result
 */
export interface SettingsValidationResult {
  isValid: boolean;
  errors: SettingsValidationError[];
  warnings: SettingsValidationWarning[];
}

export interface SettingsValidationError {
  key: string;
  message: string;
  value?: unknown;
}

export interface SettingsValidationWarning {
  key: string;
  message: string;
  value?: unknown;
}

/**
 * Telemetry event types
 */
export enum TelemetryEvent {
  ExtensionActivated = "extension.activated",
  ExtensionDeactivated = "extension.deactivated",
  AdapterDetected = "adapter.detected",
  AdapterSelected = "adapter.selected",
  ActionProcessed = "action.processed",
  ActionApproved = "action.approved",
  ActionDenied = "action.denied",
  ActionAsked = "action.asked",
  BatchApproved = "batch.approved",
  BatchRejected = "batch.rejected",
  DiffPreviewOpened = "diffPreview.opened",
  UndoPerformed = "undo.performed",
  SettingsChanged = "settings.changed",
  RateLimitHit = "rateLimit.hit",
  BudgetExhausted = "budget.exhausted",
  ModeChanged = "mode.changed",
  WorkspaceConfigLoaded = "workspaceConfig.loaded",
}

/**
 * Tree view item types for the sidebar
 */
export enum TreeItemType {
  Adapter = "adapter",
  PendingAction = "pendingAction",
  BatchHistory = "batchHistory",
  BatchEntry = "batchEntry",
}
