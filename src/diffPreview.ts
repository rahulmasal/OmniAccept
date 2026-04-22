import * as vscode from "vscode";
import {
  ActionBatch,
  DiffPreviewMessage,
  DiffPreviewState,
  FilePreview,
  ApprovalState,
} from "./types";
import { getLogger } from "./logger";
import { getApprovalEngine } from "./approvalEngine";

/**
 * Webview panel for diff preview in ASK mode
 * Enhanced with file-level approval (Enhancement 7)
 */
export class DiffPreviewPanel {
  private static panel: vscode.WebviewPanel | null = null;
  private static currentState: DiffPreviewState | null = null;

  private static readonly viewType = "universalAutoAccept.diffPreview";
  private static readonly title = "Universal Auto Accept - Diff Preview";

  /**
   * Show the diff preview panel
   */
  public static show(batch: ActionBatch): void {
    const logger = getLogger();
    logger.info(`Showing diff preview for batch: ${batch.id}`);

    // Create or reveal panel
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        this.viewType,
        this.title,
        { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        },
      );

      this.panel.onDidDispose(() => {
        this.panel = null;
        this.currentState = null;
      });
    }

    // Build file previews from actions
    const files = this.buildFilePreviews(batch);

    // Initialize file-level approval states
    const fileApprovalStates = new Map<string, ApprovalState>();
    for (const file of files) {
      fileApprovalStates.set(file.path, ApprovalState.Ask);
      file.approvalState = ApprovalState.Ask;
    }

    // Update state
    this.currentState = { batch, files, fileApprovalStates };

    // Set webview content
    this.panel.webview.html = this.buildHtml(files, batch);
    this.panel.webview.onDidReceiveMessage((message: DiffPreviewMessage) => {
      this.handleMessage(message);
    });

    // Show the panel
    this.panel.reveal(vscode.ViewColumn.Two, true);
  }

  /**
   * Build file previews from batch actions
   */
  private static buildFilePreviews(batch: ActionBatch): FilePreview[] {
    const previews: FilePreview[] = [];

    for (const action of batch.actions) {
      if (action.files) {
        for (const file of action.files) {
          let status: FilePreview["status"];

          switch (action.type) {
            case "createFiles":
              status = "added";
              break;
            case "deleteFiles":
              status = "deleted";
              break;
            case "renameFiles":
              status = "modified";
              break;
            default:
              status = "modified";
          }

          previews.push({
            path: file,
            originalContent: undefined,
            newContent: action.description,
            status,
            approvalState: ApprovalState.Ask,
          });
        }
      }
    }

    return previews;
  }

  /**
   * Handle messages from the webview
   * Enhanced with file-level approval (Enhancement 7)
   */
  private static async handleMessage(
    message: DiffPreviewMessage,
  ): Promise<void> {
    const logger = getLogger();
    const approvalEngine = getApprovalEngine();

    switch (message.type) {
      case "approve":
        logger.info(`DiffPreview: Approve batch ${message.batchId}`);
        await approvalEngine.approveCurrentBatch();
        this.hide();
        break;

      case "reject":
        logger.info(`DiffPreview: Reject batch ${message.batchId}`);
        await approvalEngine.rejectCurrentBatch();
        this.hide();
        break;

      case "approveFile":
        logger.info(`DiffPreview: Approve file ${message.filePath}`);
        this.setFileApprovalState(message.filePath, ApprovalState.Allow);
        break;

      case "rejectFile":
        logger.info(`DiffPreview: Reject file ${message.filePath}`);
        this.setFileApprovalState(message.filePath, ApprovalState.Deny);
        break;

      case "showMore":
        // Handle pagination
        break;

      case "ready":
        logger.debug("DiffPreview: Webview ready");
        break;
    }
  }

  /**
   * Set the approval state for a specific file
   */
  private static setFileApprovalState(
    filePath: string,
    state: ApprovalState,
  ): void {
    if (!this.currentState) {
      return;
    }

    this.currentState.fileApprovalStates.set(filePath, state);

    // Update the file preview
    const file = this.currentState.files.find((f) => f.path === filePath);
    if (file) {
      file.approvalState = state;
    }

    // Update the webview to reflect the change
    if (this.panel && this.currentState) {
      this.panel.webview.html = this.buildHtml(
        this.currentState.files,
        this.currentState.batch,
      );
    }

    // Check if all files have been decided
    this.checkAllFilesDecided();
  }

  /**
   * Check if all files have been individually approved/rejected
   */
  private static checkAllFilesDecided(): void {
    if (!this.currentState) {
      return;
    }

    const allDecided = this.currentState.files.every(
      (f) =>
        f.approvalState === ApprovalState.Allow ||
        f.approvalState === ApprovalState.Deny,
    );

    if (allDecided) {
      const allApproved = this.currentState.files.every(
        (f) => f.approvalState === ApprovalState.Allow,
      );
      const allRejected = this.currentState.files.every(
        (f) => f.approvalState === ApprovalState.Deny,
      );

      if (allApproved) {
        getApprovalEngine().approveCurrentBatch();
        this.hide();
      } else if (allRejected) {
        getApprovalEngine().rejectCurrentBatch();
        this.hide();
      }
      // If mixed, keep the panel open for user to use batch actions
    }
  }

  /**
   * Build the HTML content for the webview
   */
  private static buildHtml(files: FilePreview[], batch: ActionBatch): string {
    const fileListHtml = files
      .map((file, index) => {
        const approvalIcon = this.getApprovalIcon(file.approvalState);
        const approvedClass =
          file.approvalState === ApprovalState.Allow
            ? "file-approved"
            : file.approvalState === ApprovalState.Deny
              ? "file-rejected"
              : "";

        return `
            <div class="file-item ${approvedClass}" data-index="${index}">
                <div class="file-header">
                    <span class="file-status status-${file.status}">${file.status.toUpperCase()}</span>
                    <span class="file-name">${this.escapeHtml(file.path)}</span>
                    <span class="file-approval-state">${approvalIcon}</span>
                </div>
                <div class="file-content">
                    ${this.buildDiffContent(file)}
                </div>
                <div class="file-actions">
                    <button class="btn btn-approve" onclick="approveFile(${index})" ${file.approvalState === ApprovalState.Allow ? "disabled" : ""}>Approve</button>
                    <button class="btn btn-reject" onclick="rejectFile(${index})" ${file.approvalState === ApprovalState.Deny ? "disabled" : ""}>Reject</button>
                </div>
            </div>
        `;
      })
      .join("");

    const approvedCount = files.filter(
      (f) => f.approvalState === ApprovalState.Allow,
    ).length;
    const rejectedCount = files.filter(
      (f) => f.approvalState === ApprovalState.Deny,
    ).length;
    const pendingCount = files.length - approvedCount - rejectedCount;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';">
    <title>Universal Auto Accept - Diff Preview</title>
    <style>
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            padding: 20px;
            background-color: var(--vscode-editor-background, #1e1e1e);
            color: var(--vscode-editor-foreground, #d4d4d4);
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-editorLineNumber-foreground, #3c3c3c);
        }
        
        .header h1 {
            font-size: 16px;
            font-weight: 600;
            margin: 0;
        }
        
        .batch-info {
            font-size: 12px;
            color: var(--vscode-descriptionForeground, #9d9d9d);
        }
        
        .summary {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
            padding: 15px;
            background-color: var(--vscode-editorWidget-background, #252526);
            border-radius: 6px;
        }
        
        .summary-item {
            display: flex;
            flex-direction: column;
        }
        
        .summary-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground, #9d9d9d);
            text-transform: uppercase;
        }
        
        .summary-value {
            font-size: 18px;
            font-weight: 600;
        }
        
        .file-list {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        
        .file-item {
            background-color: var(--vscode-editorWidget-background, #252526);
            border-radius: 6px;
            overflow: hidden;
            transition: opacity 0.3s;
        }
        
        .file-item.file-approved {
            opacity: 0.6;
            border-left: 3px solid #2ea043;
        }
        
        .file-item.file-rejected {
            opacity: 0.6;
            border-left: 3px solid #f85149;
        }
        
        .file-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 15px;
            background-color: var(--vscode-editorWidget-border, #3c3c3c);
        }
        
        .file-approval-state {
            margin-left: auto;
            font-size: 14px;
        }
        
        .file-status {
            font-size: 10px;
            font-weight: 600;
            padding: 3px 8px;
            border-radius: 3px;
        }
        
        .status-added {
            background-color: #2ea043;
            color: white;
        }
        
        .status-modified {
            background-color: #1f6feb;
            color: white;
        }
        
        .status-deleted {
            background-color: #f85149;
            color: white;
        }
        
        .status-renamed {
            background-color: #a371f7;
            color: white;
        }
        
        .file-name {
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 12px;
        }
        
        .file-content {
            padding: 15px;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 12px;
            white-space: pre-wrap;
            max-height: 200px;
            overflow-y: auto;
        }
        
        .file-content.added {
            color: #89d185;
        }
        
        .file-content.deleted {
            color: #f85149;
        }
        
        .file-actions {
            display: flex;
            gap: 10px;
            padding: 10px 15px;
            background-color: var(--vscode-editorWidget-background, #2d2d2d);
        }
        
        .btn {
            padding: 6px 15px;
            border: none;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        
        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .btn-approve {
            background-color: #2ea043;
            color: white;
        }
        
        .btn-approve:hover:not(:disabled) {
            background-color: #3fb354;
        }
        
        .btn-reject {
            background-color: #f85149;
            color: white;
        }
        
        .btn-reject:hover:not(:disabled) {
            background-color: #ff6b6b;
        }
        
        .batch-actions {
            display: flex;
            gap: 15px;
            margin-top: 20px;
            padding: 15px;
            background-color: var(--vscode-editorWidget-background, #252526);
            border-radius: 6px;
        }
        
        .btn-approve-all {
            background-color: #2ea043;
            color: white;
            padding: 10px 25px;
        }
        
        .btn-reject-all {
            background-color: #f85149;
            color: white;
            padding: 10px 25px;
        }
        
        .progress-bar {
            display: flex;
            gap: 2px;
            margin-bottom: 15px;
            height: 6px;
            border-radius: 3px;
            overflow: hidden;
        }
        
        .progress-approved {
            background-color: #2ea043;
        }
        
        .progress-rejected {
            background-color: #f85149;
        }
        
        .progress-pending {
            background-color: #3c3c3c;
        }
        
        .footer {
            margin-top: 20px;
            text-align: center;
            font-size: 11px;
            color: var(--vscode-descriptionForeground, #9d9d9d);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Universal Auto Accept - Approval Required</h1>
        <div class="batch-info">
            Batch: ${this.escapeHtml(batch.id)} | Adapter: ${this.escapeHtml(batch.adapterName)}
        </div>
    </div>
    
    <div class="progress-bar">
        <div class="progress-approved" style="width: ${(approvedCount / files.length) * 100}%"></div>
        <div class="progress-rejected" style="width: ${(rejectedCount / files.length) * 100}%"></div>
        <div class="progress-pending" style="width: ${(pendingCount / files.length) * 100}%"></div>
    </div>
    
    <div class="summary">
        <div class="summary-item">
            <span class="summary-label">Total Files</span>
            <span class="summary-value">${files.length}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Added</span>
            <span class="summary-value">${files.filter((f) => f.status === "added").length}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Modified</span>
            <span class="summary-value">${files.filter((f) => f.status === "modified").length}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Deleted</span>
            <span class="summary-value">${files.filter((f) => f.status === "deleted").length}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">✅ Approved</span>
            <span class="summary-value">${approvedCount}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">❌ Rejected</span>
            <span class="summary-value">${rejectedCount}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">⏳ Pending</span>
            <span class="summary-value">${pendingCount}</span>
        </div>
    </div>
    
    <div class="file-list">
        ${fileListHtml}
    </div>
    
    <div class="batch-actions">
        <button class="btn btn-approve-all" onclick="approveBatch()">Approve All</button>
        <button class="btn btn-reject-all" onclick="rejectBatch()">Reject All</button>
    </div>
    
    <div class="footer">
        Universal Auto Accept Extension — Review each file individually or use batch actions
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        const batchId = '${this.escapeHtml(batch.id)}';
        
        function approveBatch() {
            vscode.postMessage({ type: 'approve', batchId });
        }
        
        function rejectBatch() {
            vscode.postMessage({ type: 'reject', batchId });
        }
        
        function approveFile(index) {
            const fileItems = document.querySelectorAll('.file-item');
            if (fileItems[index]) {
                const path = fileItems[index].querySelector('.file-name').textContent;
                vscode.postMessage({ type: 'approveFile', filePath: path, batchId });
            }
        }
        
        function rejectFile(index) {
            const fileItems = document.querySelectorAll('.file-item');
            if (fileItems[index]) {
                const path = fileItems[index].querySelector('.file-name').textContent;
                vscode.postMessage({ type: 'rejectFile', filePath: path, batchId });
            }
        }
        
        // Signal ready
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
  }

  /**
   * Get icon for approval state
   */
  private static getApprovalIcon(state?: ApprovalState): string {
    switch (state) {
      case ApprovalState.Allow:
        return "✅";
      case ApprovalState.Deny:
        return "❌";
      case ApprovalState.Ask:
        return "❓";
      default:
        return "⏳";
    }
  }

  /**
   * Build diff content for a file
   */
  private static buildDiffContent(file: FilePreview): string {
    if (file.status === "deleted") {
      return '<span class="deleted">File marked for deletion</span>';
    }

    if (file.newContent) {
      return `<span class="added">${this.escapeHtml(file.newContent)}</span>`;
    }

    return "<span>No preview available</span>";
  }

  /**
   * Escape HTML special characters
   */
  private static escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&",
      "<": "<",
      ">": ">",
      '"': '"',
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Hide the panel
   */
  public static hide(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
      this.currentState = null;
    }
  }

  /**
   * Get current state
   */
  public static getCurrentState(): DiffPreviewState | null {
    return this.currentState;
  }

  /**
   * Check if panel is visible
   */
  public static isVisible(): boolean {
    return this.panel !== null;
  }

  /**
   * Update the panel with new batch
   */
  public static update(batch: ActionBatch): void {
    if (this.panel && this.currentState) {
      const files = this.buildFilePreviews(batch);
      const fileApprovalStates = new Map<string, ApprovalState>();
      for (const file of files) {
        fileApprovalStates.set(file.path, ApprovalState.Ask);
      }
      this.currentState = { batch, files, fileApprovalStates };
      this.panel.webview.html = this.buildHtml(files, batch);
    }
  }

  /**
   * Show notification for pending actions
   */
  public static showPendingNotification(): void {
    const approvalEngine = getApprovalEngine();
    const pendingCount = approvalEngine.getPendingCount();

    if (pendingCount > 0) {
      vscode.window
        .showInformationMessage(
          `Universal Auto Accept: ${pendingCount} action(s) pending approval`,
          "View Diff",
          "Approve All",
          "Reject All",
        )
        .then(async (choice: string | undefined) => {
          const batch = approvalEngine.getCurrentBatch();
          if (batch) {
            switch (choice) {
              case "View Diff":
                this.show(batch);
                break;
              case "Approve All":
                await approvalEngine.approveCurrentBatch();
                break;
              case "Reject All":
                await approvalEngine.rejectCurrentBatch();
                break;
            }
          }
        });
    }
  }
}

/**
 * Helper to show diff preview
 */
export function showDiffPreview(batch: ActionBatch): void {
  DiffPreviewPanel.show(batch);
}
