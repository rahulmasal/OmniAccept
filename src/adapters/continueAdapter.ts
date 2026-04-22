import * as vscode from "vscode";
import {
  ActionContext,
  ActionBatch,
  AdapterStatus,
  RiskLevel,
  ApprovalState,
} from "../types";
import { BaseAdapter, createAdapterStatus } from "./interface";
import { getLogger } from "../logger";

/**
 * Adapter for Continue extension
 * Continue is an open-source AI code assistant
 */
export class ContinueAdapter extends BaseAdapter {
  readonly name = "Continue";
  readonly extensionId = "continue.continue";
  override readonly version = "1.0.0";

  private api: ContinueAPI | null = null;
  private apiDisposables: vscode.Disposable[] = [];

  constructor() {
    super();
    this.checkActive();
    this.tryConnectAPI();
  }

  private tryConnectAPI(): void {
    const logger = getLogger();
    try {
      const extension = this.getExtension(this.extensionId);
      if (extension && extension.isActive && extension.exports) {
        this.api = extension.exports as ContinueAPI;
        logger.info("Continue: Connected to extension API");
        this.setupAPIListeners();
      } else {
        logger.debug(
          "Continue: No exports API available, using file-watcher fallback",
        );
      }
    } catch (error) {
      logger.debug(`Continue: API connection failed: ${error}`);
    }
  }

  private setupAPIListeners(): void {
    if (!this.api) {
      return;
    }

    const logger = getLogger();

    if (this.api.onDidApplyEdit) {
      const sub = this.api.onDidApplyEdit((edit: unknown) => {
        logger.debug(`Continue: Edit applied: ${JSON.stringify(edit)}`);
        const action = this.createActionContext(
          "editFiles",
          "Continue edit applied",
        );
        this.emitAction(action);
      });
      this.apiDisposables.push(sub);
    }
  }

  private checkActive(): void {
    const extension = this.getExtension(this.extensionId);
    this._isActive = extension !== undefined && extension.isActive;
  }

  public isActive(): boolean {
    this.checkActive();
    return this._isActive;
  }

  public isEnabled(): boolean {
    return this.isActive();
  }

  public async getPendingActions(): Promise<ActionContext[]> {
    if (!this.isActive()) {
      return [];
    }

    const logger = getLogger();
    logger.debug("Getting pending actions from Continue");

    // Continue doesn't have a standard pending actions API
    return [];
  }

  public async approveAction(action: ActionContext): Promise<boolean> {
    const logger = getLogger();
    logger.info(`Continue: Approving action ${action.id}`);
    this.lastActivity = new Date();
    return true;
  }

  public async rejectAction(action: ActionContext): Promise<boolean> {
    const logger = getLogger();
    logger.info(`Continue: Rejecting action ${action.id}`);
    this.lastActivity = new Date();
    return true;
  }

  public async approveBatch(batch: ActionBatch): Promise<boolean> {
    const logger = getLogger();
    logger.info(
      `Continue: Approving batch ${batch.id} with ${batch.actions.length} actions`,
    );

    for (const action of batch.actions) {
      await this.approveAction(action);
    }

    return true;
  }

  public async rejectBatch(batch: ActionBatch): Promise<boolean> {
    const logger = getLogger();
    logger.info(
      `Continue: Rejecting batch ${batch.id} with ${batch.actions.length} actions`,
    );

    for (const action of batch.actions) {
      await this.rejectAction(action);
    }

    return true;
  }

  public getAdapterStatus(): AdapterStatus {
    return createAdapterStatus(
      this.name,
      this.version,
      this.isActive(),
      this.isEnabled(),
      0,
    );
  }

  public createActionContext(
    type: string,
    description: string,
    files?: string[],
  ): ActionContext {
    return {
      id: this.generateActionId(),
      type: type as ActionContext["type"],
      description,
      files,
      isWorkspaceFile: files
        ? files.every((f) => this.isPathInWorkspace(f))
        : false,
      isSensitiveFile: files ? this.containsSensitiveFiles(files) : false,
      adapterName: this.name,
      timestamp: new Date(),
      riskLevel: RiskLevel.Low,
      requiredApproval: ApprovalState.Ask,
    };
  }

  private isPathInWorkspace(filePath: string): boolean {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return false;
    }
    for (const folder of workspaceFolders) {
      const folderPath = folder.uri.fsPath.replace(/\\/g, "/").toLowerCase();
      const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();
      if (normalizedPath.startsWith(folderPath)) {
        return true;
      }
    }
    return false;
  }

  private containsSensitiveFiles(files: string[]): boolean {
    const sensitivePatterns = [
      ".env",
      ".ssh",
      "secret",
      "token",
      "key",
      "password",
      "credential",
      ".pem",
    ];
    for (const file of files) {
      const lowerFile = file.toLowerCase();
      for (const pattern of sensitivePatterns) {
        if (lowerFile.includes(pattern)) {
          return true;
        }
      }
    }
    return false;
  }

  public override dispose(): void {
    super.dispose();
    this.apiDisposables.forEach((d) => d.dispose());
    this.apiDisposables = [];
  }
}

/**
 * Continue extension API interface (best-effort)
 */
interface ContinueAPI {
  onDidApplyEdit?: (callback: (edit: unknown) => void) => vscode.Disposable;
  onDidAcceptSuggestion?: (
    callback: (suggestion: unknown) => void,
  ) => vscode.Disposable;
}
