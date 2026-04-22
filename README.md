# Universal Auto Accept

A VS Code extension that provides a generic approval management system for AI coding extensions like Roo Code and Kilo Code. Enables auto-approval of safe actions while protecting against destructive or sensitive operations.

## Features

### Core Functionality
- **Auto-Approve Safe Actions**: Automatically approve low-risk file edits within the workspace
- **Risk-Based Approval**: Actions are categorized as Low/Medium/High risk with appropriate handling
- **Batch Processing**: Group related actions for efficient approval/rejection
- **Undo Support**: Revert changes from the last approved batch

### Adapter System
- **Roo Code Adapter**: Native support for Roo Code extension
- **Kilo Code Adapter**: Native support for Kilo Code extension
- **Generic Adapter**: Fallback adapter using file system watching
- **Extensible**: Easy to add support for additional AI coding extensions

### Action Type Support
| Action Type | Default Policy | Description |
|-------------|----------------|-------------|
| Read Files | Allow | Reading files from workspace |
| Edit Files | Allow | Editing existing files |
| Create Files | Ask | Creating new files |
| Delete Files | Deny | Deleting files |
| Rename Files | Ask | Renaming files |
| Terminal Commands | Deny | Executing terminal commands |
| Browser Tools | Deny | Browser automation |
| MCP Tools | Deny | Model Context Protocol access |
| External Directory | Deny | Accessing directories outside workspace |
| Sensitive Files | Deny | Accessing secrets, keys, credentials |

### Configuration Options
- Enable/disable the extension
- Trusted workspace only mode
- Per-action-type approval rules
- Sensitive file pattern customization
- Auto-approve delay
- Notification settings
- Ask mode timeout

## Installation

### From VSIX
1. Download the `.vsix` file from releases
2. Run: `code --install-extension universal-auto-accept.vsix`

### From Source
```bash
npm install
npm run compile
npm run package
code --install-extension ./universal-auto-accept-*.vsix
```

## Configuration

### Settings (package.json contributed)

```json
{
  "universalAutoAccept.enabled": true,
  "universalAutoAccept.trustedWorkspaceOnly": true,
  "universalAutoAccept.defaultPolicy": "ask",
  "universalAutoAccept.adapterSettings": {
    "rooCode": true,
    "kiloCode": true
  },
  "universalAutoAccept.actionRules": {
    "readFiles": "allow",
    "editFiles": "allow",
    "createFiles": "ask",
    "deleteFiles": "deny",
    "renameFiles": "ask",
    "terminalCommand": "deny",
    "browserTool": "deny",
    "mcpToolAccess": "deny",
    "externalDirectoryAccess": "deny",
    "sensitiveFileAccess": "deny"
  },
  "universalAutoAccept.sensitiveFilePatterns": [
    "**/.env*",
    "**/.ssh/**",
    "**/*secret*",
    "**/*token*",
    "**/*key*",
    "**/credentials*",
    "**/*.pem"
  ],
  "universalAutoAccept.maxUndoBatchSize": 10,
  "universalAutoAccept.autoApproveDelay": 0,
  "universalAutoAccept.logLevel": "info",
  "universalAutoAccept.statusBarMode": "on",
  "universalAutoAccept.showNotifications": true,
  "universalAutoAccept.askModeTimeout": 300
}
```

See `sample-settings.json` for a complete example.

## Commands

| Command | Description |
|---------|-------------|
| `universalAutoAccept.toggleEnabled` | Toggle the extension on/off |
| `universalAutoAccept.openSettings` | Open extension settings |
| `universalAutoAccept.approveCurrentBatch` | Approve all pending actions |
| `universalAutoAccept.rejectCurrentBatch` | Reject all pending actions |
| `universalAutoAccept.showActiveAdapter` | Show current adapter info |
| `universalAutoAccept.rescanAdapters` | Re-scan for compatible extensions |
| `universalAutoAccept.undoLastBatch` | Undo last approved batch |
| `universalAutoAccept.showDiffPreview` | Show diff preview of pending changes |

## Status Bar

The extension adds a status bar item showing the current mode:
- 🟢 **ON** (green): Auto-approve enabled
- 🟡 **ASK** (yellow): Confirmation required
- 🔴 **OFF** (red): Extension disabled

Click on the status bar item to toggle the mode.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    extension.ts                      │
│            (Main entry point, activation)            │
└───────────────────────────┬─────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ adapterRegistry│   │   commands.ts │   │    logger.ts │
│ (Plugin System)│   │  (Handlers)   │   │(Output Channel)│
└───────┬───────┘   └───────────────┘   └───────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────┐
│                    approvalEngine.ts                 │
│            (Core approval state machine)              │
└───────────────────────────┬─────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────┐
│                    riskAnalyzer.ts                    │
│              (Action risk assessment)                │
└───────────────────────────┬─────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────┐
│                     settings.ts                       │
│               (Configuration access)                  │
└─────────────────────────────────────────────────────┘
```

## API Limitations

This extension operates within VS Code's public API limitations. See [LIMITATIONS.md](LIMITATIONS.md) for details.

### Key Limitations

1. **No Official Hook System**: VS Code has no public API to intercept or cancel AI extension actions before they execute.

2. **No Cancel/Undo API**: Cannot programmatically undo changes made by other extensions. The undo feature works by tracking file operations and attempting to revert them.

3. **File Watching Latency**: File system events may fire after changes are applied, depending on OS-level timing.

4. **Extension Discovery**: No API to list installed extensions' capabilities. Known extension IDs are hardcoded.

5. **Terminal Integration**: Cannot intercept terminal command execution.

### Workarounds Implemented

- File system watching for change detection
- Configuration observation for state changes
- Status bar integration for visual feedback
- Webview-based diff preview for manual review
- Undo stack for tracking and reverting changes

## Development

### Prerequisites
- Node.js 18+
- VS Code 1.85+
- npm 9+

### Setup
```bash
npm install
```

### Build
```bash
npm run compile
```

### Watch (development)
```bash
npm run watch
```

### Package
```bash
npm run package
```

### Lint
```bash
npm run lint
```

## Contributing

Contributions are welcome! Please ensure:
1. TypeScript strict mode compliance
2. Test coverage for new features
3. Documentation updates

## License

MIT

## Acknowledgments

- VS Code Extension API
- Roo Code extension
- Kilo Code extension