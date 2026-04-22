import * as vscode from 'vscode';

/**
 * Action types that the approval engine can handle
 */
export enum ActionType {
    ReadFiles = 'readFiles',
    EditFiles = 'editFiles',
    CreateFiles = 'createFiles',
    DeleteFiles = 'deleteFiles',
    RenameFiles = 'renameFiles',
    TerminalCommand = 'terminalCommand',
    BrowserTool = 'browserTool',
    McpToolAccess = 'mcpToolAccess',
    ExternalDirectoryAccess = 'externalDirectoryAccess',
    SensitiveFileAccess = 'sensitiveFileAccess'
}

/**
 * Approval states for actions
 */
export enum ApprovalState {
    Allow = 'allow',
    Ask = 'ask',
    Deny = 'deny'
}

/**
 * Risk levels for actions
 */
export enum RiskLevel {
    Low = 'low',
    Medium = 'medium',
    High = 'high'
}

/**
 * Extension mode for the status bar
 */
export type ExtensionMode = 'on' | 'ask' | 'off';

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
    Pending = 'pending',
    Approved = 'approved',
    Rejected = 'rejected',
    PartiallyApproved = 'partiallyApproved'
}

/**
 * Undo entry for reverting changes
 */
export interface UndoEntry {
    batchId: string;
    timestamp: Date;
    changes: FileChange[];
    adapterName: string;
}

export interface FileChange {
    type: 'create' | 'edit' | 'delete' | 'rename';
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
    sensitiveFilePatterns: string[];
    maxUndoBatchSize: number;
    autoApproveDelay: number;
    logLevel: LogLevel;
    statusBarMode: ExtensionMode;
    showNotifications: boolean;
    askModeTimeout: number;
}

export interface AdapterSettingsConfig {
    rooCode: boolean;
    kiloCode: boolean;
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

export type LogLevel = 'off' | 'error' | 'warn' | 'info' | 'debug';

/**
 * Webview message types for diff preview
 */
export type DiffPreviewMessage =
    | { type: 'approve'; batchId: string }
    | { type: 'reject'; batchId: string }
    | { type: 'approveFile'; filePath: string }
    | { type: 'rejectFile'; filePath: string }
    | { type: 'showMore'; offset: number }
    | { type: 'ready' };

export interface DiffPreviewState {
    batch: ActionBatch;
    files: FilePreview[];
}

export interface FilePreview {
    path: string;
    originalContent?: string;
    newContent?: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
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