# 🎯 OmniAccept

> **Smart approval management for AI coding assistants** — Auto-approve safe actions, protect against dangerous ones.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Installs](https://img.shields.io/visual-studio-marketplace/i/universal-auto-accept?label=installs&color=green)
![License](https://img.shields.io/badge/license-MIT-yellow)
![Build Status](https://img.shields.io/badge/build-retired-red)
![Made with ❤️ by Omni Enterprise](https://img.shields.io/badge/Made%20with%20%E2%9D%A4%EF%B8%8F%20by%20Omni%20Enterprise-Rahul%20Masal-orange)

<!-- TABLE -->
| | |
|---|---|
| **Works with** | 🦘 Roo Code · ⚡️ Kilo Code · 🤖 Any AI assistant |
| **VS Code** | 1.85+ |
| **License** | MIT |

---

## 🚀 Quick Start

### Installation

**Option 1: VS Code Marketplace** *(Recommended)*
> Open in VS Code: `ext install universal-auto-accept`

**Option 2: VSIX**
```bash
# Download from releases
code --install-extension universal-auto-accept.vsix
```

**Option 3: Build from Source**
```bash
git clone https://github.com/omni-enterprise/universal-auto-accept.git
cd universal-auto-accept
npm install
npm run compile && npm run package
code --install-extension ./universal-auto-accept-*.vsix
```

### First Steps

1. **Install** the extension
2. **Trust your workspace** (required for auto-approve)
3. **Done!** — Safe actions auto-approve, sensitive ones prompt

> 💡 **Tip:** Click the status bar to toggle modes: 🟢 ON / 🟡 ASK / 🔴 OFF

---

## ✨ Features

<!-- FEATURE GRID -->
<table>
<tr>

<td>

### 🛡️ Risk-Based Protection

Automatically categorize actions as **Low** ⚡, **Medium** ⚠️, or **High** 🚨 risk with appropriate handling.

</td>

<td>

### ⚡️ Lightning-Fast Auto-Approve

Safe file edits get approved instantly — no interruption to your flow.

</td>

</tr>
<tr>

<td>

### 🔌 Universal Adapter System

Works with Roo Code, Kilo Code, and extensible to future AI assistants.

</td>

<td>

### 🔄 Batch Processing

Group related actions for efficient approval. Undo entire batches with one click.

</td>

</tr>
<tr>

<td>

### 🔒 Sensitive File Guard

Automatically blocks access to `.env`, `.ssh`, `secrets`, tokens, keys, and more.

</td>

<td>

### 👀 Diff Preview

Visual diff of pending changes before you approve — see exactly what will change.

</td>

</tr>
<tr>

<td>

### 📊 Status Bar Dashboard

Real-time mode indicator at a glance. Click to toggle or access commands.

</td>

<td>

### ⚙️ Fully Configurable

Granular control over every action type. Customize patterns, timeouts, and behavior.

</td>

</tr>
</table>

---

## 🎬 How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   🤖 AI Assistant (Roo Code / Kilo Code)                        │
│           │                                                     │
│           ▼                                                     │
│   ┌───────────────────┐                                        │
│   │  Action Detection │  ← File watcher monitors changes       │
│   └─────────┬─────────┘                                        │
│             │                                                   │
│             ▼                                                   │
│   ┌───────────────────┐                                        │
│   │  Risk Analyzer    │  ← Checks patterns, action type        │
│   │  🔍 Risk Score    │     and sensitive file rules            │
│   └─────────┬─────────┘                                        │
│             │                                                   │
│             ▼                                                   │
│   ┌───────────────────┐     ┌──────────────────────┐          │
│   │  Approval Engine  │────►│  Policy Decision     │          │
│   │                    │     │  ✅ Allow / ⚠️ Ask / 🚫 Deny│          │
│   └─────────┬─────────┘     └──────────────────────┘          │
│             │                                                   │
│             ▼                                                   │
│   ┌───────────────────┐                                        │
│   │  Action Executor  │  ← Apply changes or show preview       │
│   └───────────────────┘                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Status Bar Indicators

| State | Color | Meaning |
|-------|-------|---------|
| 🟢 **ON** | Green | Auto-approve enabled — safe actions go through |
| 🟡 **ASK** | Yellow | Confirmation required — review before proceeding |
| 🔴 **OFF** | Red | Extension disabled — all actions denied |

---

## 📋 Action Types & Default Policies

| Action | Policy | Description |
|--------|--------|-------------|
| 📖 Read Files | ✅ Allow | Reading workspace files |
| ✏️ Edit Files | ✅ Allow | Modifying existing files |
| 📝 Create Files | ⚠️ Ask | Creating new files |
| 🗑️ Delete Files | 🚫 Deny | Deleting files |
| 📁 Rename Files | ⚠️ Ask | Moving/renaming files |
| 💻 Terminal Commands | 🚫 Deny | Shell execution |
| 🌐 Browser Tools | 🚫 Deny | Browser automation |
| 🔧 MCP Tools | 🚫 Deny | Model Context Protocol |
| 📂 External Directory | 🚫 Deny | Outside workspace |
| 🔐 Sensitive Files | 🚫 Deny | Secrets, keys, tokens |

---

## ⚙️ Configuration

### Quick Settings

```json
{
  "universalAutoAccept.enabled": true,
  "universalAutoAccept.trustedWorkspaceOnly": true,
  "universalAutoAccept.defaultPolicy": "ask"
}
```

### Full Settings Reference

```json
{
  // ============ CORE ============
  "universalAutoAccept.enabled": true,
  "universalAutoAccept.trustedWorkspaceOnly": true,
  "universalAutoAccept.defaultPolicy": "ask",

  // ============ ADAPTERS ============
  "universalAutoAccept.adapterSettings": {
    "rooCode": true,
    "kiloCode": true
  },

  // ============ ACTION RULES ============
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

  // ============ SECURITY ============
  "universalAutoAccept.sensitiveFilePatterns": [
    "**/.env*",
    "**/.ssh/**",
    "**/*secret*",
    "**/*token*",
    "**/*key*",
    "**/credentials*",
    "**/*.pem"
  ],

  // ============ BEHAVIOR ============
  "universalAutoAccept.autoApproveDelay": 0,
  "universalAutoAccept.askModeTimeout": 300,
  "universalAutoAccept.maxUndoBatchSize": 10,

  // ============ UI ============
  "universalAutoAccept.showNotifications": true,
  "universalAutoAccept.statusBarMode": "on",
  "universalAutoAccept.logLevel": "info"
}
```

> 📖 See [`sample-settings.json`](./sample-settings.json) for complete examples.

---

## ⌨️ Commands

Open the **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Shortcut | Description |
|---------|----------|-------------|
| `Toggle Enabled` | — | Enable/disable extension |
| `Open Settings` | — | Open extension settings |
| `Approve Current Batch` | — | Approve all pending actions |
| `Reject Current Batch` | — | Reject all pending actions |
| `Show Diff Preview` | `Ctrl+Shift+D` | View pending changes |
| `Undo Last Batch` | — | Revert last approved batch |
| `Show Active Adapter` | — | Display adapter info |
| `Rescan Adapters` | — | Re-detect AI extensions |

---

## 🔌 Works With

<div align="center">

### Supported AI Assistants

| [🦘 Roo Code](https://marketplace.visualstudio.com/items?itemName=Rooveterinary.roo-code) | [⚡️ Kilo Code](https://marketplace.visualstudio.com/items?itemName=KiloCode.kilo-code) |
|:---:|:---:|
| Native adapter | Native adapter |

### Easy to Extend

The adapter system makes it simple to add support for new AI coding assistants.

```typescript
// Create your adapter
class MyAdapter implements IAdapter {
  name = 'my-ai-assistant';
  activate(): void { /* ... */ }
  deactivate(): void { /* ... */ }
}

// Register it
adapterRegistry.register(new MyAdapter());
```

</div>

---

## ❓ FAQ & Troubleshooting

### Q: Why aren't actions auto-approving?
**A:** Check if:
- Your workspace is trusted (`Ctrl+Shift+P` → "Trust Workspace")
- The extension is enabled (status bar shows 🟢)
- The action type is set to `allow` in settings

### Q: How do I protect specific files?
**A:** Add glob patterns to `universalAutoAccept.sensitiveFilePatterns`:
```json
"universalAutoAccept.sensitiveFilePatterns": [
  "**/.env*",
  "**/my-secret-file.json"
]
```

### Q: Can I undo changes?
**A:** Yes! Run `Universal Auto Accept: Undo Last Batch` from the Command Palette. Note: Undo is best-effort and may not work for all file types.

### Q: Does this work with [Other AI Extension]?
**A:** Currently supports Roo Code and Kilo Code natively. Other extensions use the generic file-watching adapter. Open an issue to request native support!

### Q: How do I see what's happening?
**A:** Set log level to `debug` in settings, then open **Output** → **Universal Auto Accept** to see detailed logs.

---

## 📐 Architecture

```
extension.ts
│
├── commands.ts          ← Command handlers
├── adapterRegistry.ts   ← Plugin system
│   ├── rooAdapter.ts    ← 🦘 Roo Code integration
│   ├── kiloAdapter.ts   ← ⚡ Kilo Code integration
│   └── genericAdapter.ts← Fallback watcher
│
├── approvalEngine.ts    ← Core state machine
├── riskAnalyzer.ts      ← Action risk assessment
├── settings.ts          ← Configuration access
├── diffPreview.ts       ← Webview diff viewer
└── logger.ts            ← Logging system
```

---

## 🚨 Important Limitations

This extension operates within **VS Code's public API**, which has inherent limitations:

| What We **Can** Do | What We **Cannot** Do |
|---|---|
| ✅ Detect file changes via watchers | ❌ Intercept actions before execution |
| ✅ Offer undo for changes | ❌ Guarantee reliable undo |
| ✅ Show diff previews | ❌ Prevent terminal commands |
| ✅ Pattern-match sensitive files | ❌ Communicate with AI extensions |

> 📖 See [`LIMITATIONS.md`](LIMITATIONS.md) for full details.

---

## ❤️ Contributing

Contributions are welcome! Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Install dependencies
npm install

# Build (compile TypeScript)
npm run compile

# Watch mode (auto-recompile)
npm run watch

# Lint
npm run lint

# Package for distribution
npm run package
```

### Prerequisites

- Node.js 18+
- VS Code 1.85+
- npm 9+

---

## 📜 License

MIT License — see [`LICENSE`](LICENSE) for details.

---

## 🙏 Acknowledgments

Built with the [VS Code Extension API](https://code.visualstudio.com/api).

Special thanks to the teams behind:
- [🦘 Roo Code](https://github.com/RooVeterinaryInc/roo-code)
- [⚡️ Kilo Code](https://github.com/KiloCode/kilo-code)
- [VS Code](https://github.com/microsoft/vscode)

---

<div align="center">

**Made with ❤️ by [Omni Enterprise](https://omni-enterprise.dev)**

⭐ Star this project if it helps you!

</div>