# VS Code Public API Limitations

This document describes the limitations imposed by VS Code's public extension API that affect this extension's functionality.

## Overview

VS Code's public extension API does not expose several internal systems that would be necessary for deep integration with AI coding extensions. This document explains what's not possible and the workarounds implemented.

---

## 1. No Action Interception API

### Limitation
There is no public API to intercept, modify, or cancel actions taken by other extensions (like Roo Code or Kilo Code) before or during execution.

### What We Cannot Do
- Intercept file read/write operations before they happen
- Cancel an in-progress AI action
- Modify parameters of an AI-proposed change
- Insert pre-action approval dialogs
- See the exact content of proposed changes before they're applied

### Current Workaround
The extension uses file system watchers (`vscode.workspace.createFileSystemWatcher`) to detect changes after they occur. This means:
- Changes may already be applied by the time we detect them
- We cannot prevent unwanted changes
- We can only detect and offer to revert them

### Impact
- Medium to High: Cannot provide real-time approval workflow
- Actions may require undo rather than rejection

---

## 2. No Programmatic Undo API

### Limitation
VS Code does not expose a programmatic undo/redo API. Extensions cannot execute undo operations.

### What We Cannot Do
- Automatically undo changes made by AI extensions
- Execute multi-step undo sequences
- Restore deleted files programmatically
- Revert file content to previous state

### Current Workaround
The extension implements an **undo stack** that:
1. Tracks file operations (create, edit, delete) with original content
2. Attempts to manually revert changes using `vscode.workspace.fs` APIs
3. May fail for complex operations or deleted files without backups

### Limitations of Workaround
- Cannot restore original file permissions
- Cannot restore symlinks
- Cannot restore binary files reliably
- May fail if file was modified externally

### Impact
- High: Undo functionality is best-effort, not guaranteed

---

## 3. No Extension Communication API

### Limitation
There is no API for one extension to communicate with or control another extension.

### What We Cannot Do
- Send approval/rejection signals to Roo Code or Kilo Code
- Query the internal state of AI extensions
- Influence the AI's behavior or suggest changes
- Receive notifications from AI extensions about pending actions

### Current Workaround
None. The adapter system relies on:
1. File system watching for change detection
2. Configuration observation
3. User-initiated actions via Command Palette

### Impact
- High: True integration with AI extensions is not possible

---

## 4. No Terminal Command Interception

### Limitation
VS Code's terminal API does not allow intercepting command execution or previewing commands before they run.

### What We Cannot Do
- Preview terminal commands before execution
- Cancel or modify terminal commands
- See command output before it's displayed
- Inject confirmation prompts for terminal commands

### Current Workaround
None. Terminal commands executed by AI extensions execute immediately without notification.

### Impact
- High: Terminal commands cannot be controlled

---

## 5. Webview Limitations

### Limitation
Webview panels have limited access to VS Code's theming and APIs.

### What We Cannot Do
- Automatically follow VS Code color theme changes (only on load)
- Access VS Code's semantic token information
- Use VS Code's native diff editor component
- Receive real-time updates about file changes

### Current Workaround
The diff preview webview:
1. Uses CSS custom properties that map to VS Code variables
2. Manually updates when batch changes occur
3. Cannot show live diff of actual content changes

### Impact
- Medium: Diff preview may not perfectly match VS Code's appearance

---

## 6. Extension Discovery Limitations

### Limitation
No API exists to discover what capabilities an installed extension provides.

### What We Cannot Do
- Query an extension's supported features
- Detect if an extension is an AI coding assistant
- Discover extension-specific APIs or events
- Dynamically adapt to different AI extension behaviors

### Current Workaround
Known extension IDs are hardcoded:
```typescript
const knownExtensions = [
  'rooveterinary.roo-code',
  'kilocode.kilo-code',
  'anthropic.anthropic-code',
  'github.copilot',
  'aws.amazon-q',
  'continue.continue'
];
```

### Impact
- Low: Only supports known AI coding extensions

---

## 7. File Watching Timing

### Limitation
File system events may be delayed due to OS-level file system caching and batching.

### What We Cannot Do
- Guarantee immediate detection of file changes
- See changes in real-time
- Detect the exact moment a file is modified

### Current Workaround
- Use `vscode.workspace.createFileSystemWatcher` with glob patterns
- Accept that some changes may be missed during high-frequency operations

### Impact
- Low to Medium: May miss rapid sequences of changes

---

## 8. Status Bar Limitations

### Limitation
Status bar items have limited interactivity and cannot display complex UI.

### What We Cannot Do
- Show dropdown menus from status bar items
- Display real-time pending action count with detailed breakdown
- Provide inline approval buttons

### Current Workaround
Status bar item:
- Shows current mode (ON/ASK/OFF)
- Displays adapter name
- Click opens Command Palette or toggles mode

### Impact
- Low: Limited UI but functional

---

## 9. Configuration Change Latency

### Limitation
Configuration changes may not be immediately reflected in extension behavior.

### What We Cannot Do
- Guarantee immediate application of setting changes
- Prevent actions already in progress from completing

### Current Workaround
- Settings are cached and updated on `onDidChangeConfiguration` event
- In-progress actions use settings snapshot from when they started

### Impact
- Low: Minor timing inconsistencies possible

---

## 10. No Background Processing API

### Limitation
VS Code extensions cannot run persistent background processes efficiently.

### What We Cannot Do
- Run continuous monitoring without resource impact
- Maintain persistent connections to external services
- Process large batches without affecting VS Code performance

### Current Workaround
- Event-driven architecture using VS Code's event system
- Minimal polling for adapter status
- Debounced file change handling

### Impact
- Low: Extension is designed to be lightweight

---

## Summary

| Feature | Limitation Level | Workaround | Reliability |
|---------|------------------|------------|-------------|
| Action Interception | High | File watching | Medium |
| Programmatic Undo | High | Manual revert | Low |
| Extension Communication | High | None | N/A |
| Terminal Control | High | None | N/A |
| Webview Theming | Medium | CSS variables | Medium |
| Extension Discovery | Low | Hardcoded IDs | High |
| File Watching | Low-Medium | Event listeners | Medium |
| Status Bar | Low | Basic display | High |
| Config Changes | Low | Event system | High |
| Background Processing | Low | Event-driven | High |

---

## What This Means for Users

1. **Real-time approval is limited**: The extension can detect and offer to undo changes, but cannot prevent them.

2. **Undo is best-effort**: Not all changes can be reliably undone.

3. **Terminal commands are uncontrolled**: No protection for dangerous shell commands.

4. **AI integration is basic**: Only detects that an AI extension is installed, not its internal state.

5. **File changes are observed, not prevented**: Sensitive files can be protected by pattern matching, but the warning happens after the fact.

---

## Future Possibilities

If VS Code were to add new APIs, the following would enable full functionality:

1. **Action Interception API**: Allow extensions to register for file/terminal operations before execution
2. **Extension-to-Extension Communication**: Allow controlled message passing between extensions
3. **Programmatic Undo/Redo**: Expose the internal undo stack for extensions
4. **Terminal Command Preview**: Allow extensions to inspect commands before execution

These features would be game-changers for approval management extensions and are worth requesting from the VS Code team.

---

## Contributing Workarounds

If you're implementing a similar extension, consider:

1. Using file watchers as the primary change detection mechanism
2. Building a robust undo stack with content snapshots
3. Focusing on detection and reporting rather than prevention
4. Setting appropriate user expectations about limitations
5. Contributing feature requests to VS Code's GitHub

---

*Last updated: 2024*