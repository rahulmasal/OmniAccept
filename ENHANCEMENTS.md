# 🚀 OmniAccept Enhancement Suggestions

> Prioritized list of improvements based on codebase analysis — organized by impact and effort.

---

## 🔴 High Impact, Medium Effort

### 1. Implement Action History & Analytics Dashboard

**Problem:** The types [`ActionHistoryEntry`](src/types.ts:215) and [`ApprovalAnalytics`](src/types.ts:227) are defined but never used. There's no way to review past decisions or understand approval patterns.

**Proposal:**

- Add an `ActionHistory` class that persists decisions to `globalState` or a workspace `.omniaccept-history.json`
- Track every approve/deny/ask decision with timestamp, action type, files, and adapter
- Add a webview-based analytics dashboard showing:
  - Approval/denial rates over time
  - Most commonly denied action types
  - Per-adapter statistics
  - Average response time in ASK mode
- Add commands: `Show History`, `Export History`, `Clear History`
- Add a `universalAutoAccept.maxHistorySize` setting (default: 500)

**Files to modify:** `src/approvalEngine.ts`, `src/commands.ts`, `src/types.ts`, `package.json`

---

### 2. Implement Workspace-Level Configuration (`.omniaccept.json`)

**Problem:** The [`WorkspaceConfig`](src/types.ts:207) interface exists but is unused. All settings are application-wide, so different projects can't have different approval rules.

**Proposal:**

- Support a `.omniaccept.json` file at workspace root that overrides global settings
- Merge strategy: workspace config overrides global config (like `.eslintrc` vs global ESLint)
- Add a command to scaffold a `.omniaccept.json` from current settings
- Validate the file schema on load with clear error messages
- Add `universalAutoAccept.ignoreWorkspaceConfig` setting to enforce global-only mode

**Example config:**

```json
{
  "actionRules": {
    "editFiles": "ask",
    "terminalCommand": "deny"
  },
  "sensitiveFilePatterns": ["**/config/*.prod.*"],
  "conditionalRules": [
    { "pattern": "src/test/**", "policy": "allow", "actionType": "editFiles" }
  ]
}
```

**Files to modify:** `src/settings.ts`, `src/commands.ts`, `src/types.ts`, `package.json`

---

### 3. Implement Conditional Rules Engine

**Problem:** The [`ConditionalRule`](src/types.ts:196) interface is defined but the risk analyzer doesn't use it. Currently, rules are flat per-action-type with no path-based granularity.

**Proposal:**

- Evaluate conditional rules in [`RiskAnalyzer.analyze()`](src/riskAnalyzer.ts:48) after action-type rules
- Support glob patterns for file paths (e.g., `src/test/**` → auto-approve edits)
- Support per-adapter rules (e.g., Roo Code can edit tests, Kilo Code cannot)
- Priority: conditional rules > action rules > default policy
- Add a settings UI for managing conditional rules

**Files to modify:** `src/riskAnalyzer.ts`, `src/settings.ts`, `package.json`

---

### 4. Implement Terminal Command Whitelist/Blacklist

**Problem:** The [`TerminalRule`](src/types.ts:202) interface exists but is unused. Terminal commands are blanket-denied with no granularity.

**Proposal:**

- Add `universalAutoAccept.terminalWhitelist` and `universalAutoAccept.terminalBlacklist` settings
- Whitelist patterns: `npm test`, `git status`, `ls`, `echo *` (glob-supported)
- Blacklist patterns: `rm -rf *`, `sudo *`, `curl *|*`, `chmod 777 *`
- When a terminal command matches whitelist → `Allow`; matches blacklist → `Deny`; otherwise → default policy
- Add regex support for advanced patterns (e.g., `npm run [a-z-]+`)
- Show command preview in ASK mode with risk explanation

**Files to modify:** `src/riskAnalyzer.ts`, `src/settings.ts`, `src/approvalEngine.ts`, `package.json`

---

## 🟡 Medium Impact, Low Effort

### 5. Implement Git-Based Undo

**Problem:** The `useGitUndo` setting exists in [`ExtensionSettings`](src/types.ts:169) but is never loaded or used. The current undo stack is best-effort and unreliable for complex operations (as documented in [`LIMITATIONS.md`](LIMITATIONS.md:35)).

**Proposal:**

- When `useGitUndo` is `true` and the workspace is a git repo, use `git checkout -- <file>` or `git restore <file>` for undo
- Fall back to the manual undo stack for non-git workspaces
- Add a command: `Undo Last Batch (Git)` that runs `git restore` on affected files
- Show a warning when undoing operations that aren't easily reversible (e.g., deleted untracked files)
- Add `universalAutoUndo.gitUndoDryRun` setting to preview what git undo would do

**Files to modify:** `src/approvalEngine.ts`, `src/settings.ts`, `src/commands.ts`

---

### 6. Implement Audio Notifications

**Problem:** The `audioNotifications` setting exists in [`ExtensionSettings`](src/types.ts:167) but is never loaded or used.

**Proposal:**

- Play a subtle sound when:
  - Action auto-approved (soft chime)
  - Action requires confirmation (alert tone)
  - Action denied (warning tone)
  - Batch completed (success tone)
- Use VS Code's built-in audio cues where possible (`vscode.window.showInformationMessage` doesn't support audio, so use the `audioCues` API or custom sounds)
- Add `universalAutoAccept.audioVolume` setting (0-100)
- Respect VS Code's global `audioCues.enabled` setting

**Files to modify:** `src/settings.ts`, `src/approvalEngine.ts`, `package.json`

---

### 7. Add File-Level Approval in Diff Preview

**Problem:** The diff preview webview has [`approveFile`](src/diffPreview.ts:111) and [`rejectFile`](src/diffPreview.ts:116) message handlers that are stubbed out with `// Would need to implement`.

**Proposal:**

- Implement granular file-level approval within a batch
- Allow users to approve some files and reject others in the same batch
- Track per-file approval state in `DiffPreviewState`
- Update the batch status to `PartiallyApproved` when some files are approved
- Add "Approve All" / "Reject All" bulk actions
- Persist file-level decisions until the batch is resolved

**Files to modify:** `src/diffPreview.ts`, `src/approvalEngine.ts`, `src/types.ts`

---

### 8. Add Keyboard Shortcuts for Common Operations

**Problem:** No keybindings are registered. Users must use the Command Palette or status bar for every operation.

**Proposal:**

- Add default keybindings:
  - `Ctrl+Shift+A A` — Toggle auto-approve on/off
  - `Ctrl+Shift+A B` — Approve current batch
  - `Ctrl+Shift+A R` — Reject current batch
  - `Ctrl+Shift+A D` — Show diff preview
  - `Ctrl+Shift+A U` — Undo last batch
  - `Ctrl+Shift+A S` — Open settings
- Make all keybindings configurable via `package.json` contributes.keybindings
- Add when-clauses so shortcuts only work when the extension is active

**Files to modify:** `package.json`

---

### 9. Add Rate Limiting for Auto-Approve

**Problem:** There's no protection against an AI assistant generating rapid-fire actions. A runaway AI could make hundreds of changes before the user notices.

**Proposal:**

- Add `universalAutoAccept.maxAutoApprovesPerMinute` setting (default: 30)
- Add `universalAutoAccept.maxAutoApprovesPerSession` setting (default: 0 = unlimited)
- When the rate limit is hit, automatically switch to ASK mode and show a notification
- Add `universalAutoAccept.rateLimitAction` setting: `"ask"` | `"pause"` | `"off"`
- Track approve timestamps in a sliding window
- Show rate limit status in the status bar

**Files to modify:** `src/approvalEngine.ts`, `src/settings.ts`, `src/extension.ts`, `package.json`

---

## 🟢 Lower Impact, Quick Wins

### 10. Add Debounce/Coalescing for Rapid File Changes

**Problem:** The [`GenericAdapter`](src/adapters/genericAdapter.ts:10) fires a separate action for every file change. During bulk operations (e.g., `npm install`), this creates hundreds of individual actions.

**Proposal:**

- Add a configurable debounce window (default: 500ms) in `GenericAdapter.handleFileChange()`
- Coalesce changes to the same file within the window (keep latest)
- Group changes across files into a single batch action
- Add `universalAutoAccept.changeDebounceMs` setting

**Files to modify:** `src/adapters/genericAdapter.ts`, `src/settings.ts`

---

### 11. Add a Tree View for Pending Actions & Adapter Status

**Problem:** The status bar only shows mode and adapter name. There's no way to see pending actions, batch history, or adapter details without opening commands.

**Proposal:**

- Add a sidebar tree view (`universalAutoAccept.explorer`) with three sections:
  - **Active Adapter** — Shows adapter name, status, and last activity
  - **Pending Actions** — Lists all pending actions with risk badges
  - **Recent Batches** — Shows last 10 batches with approve/deny counts
- Inline actions on tree items (approve/reject individual actions)
- Click on an action to open the diff preview
- Refresh button to rescan adapters

**Files to modify:** `src/extension.ts`, new file `src/treeView.ts`, `package.json`

---

### 12. Add Session-Based Auto-Approve Limits

**Problem:** Users may want auto-approve for a limited number of actions, then switch to manual review.

**Proposal:**

- Add `universalAutoAccept.autoApproveBudget` setting (default: 0 = unlimited)
- Track auto-approve count per VS Code session
- When budget is exhausted, switch to ASK mode with a notification
- Add a command to reset the session budget
- Show remaining budget in status bar tooltip

**Files to modify:** `src/approvalEngine.ts`, `src/settings.ts`, `src/extension.ts`

---

### 13. Improve Sensitive File Pattern Matching

**Problem:** The current [`matchGlobPattern()`](src/riskAnalyzer.ts:172) is a custom implementation that may not handle all glob patterns correctly. The `*key*` pattern in defaults also matches files like `keyboard-shortcuts.ts` or `monkey.ts`.

**Proposal:**

- Use VS Code's built-in `vscode.RelativePattern` or the `minimatch`/`picomatch` npm package for glob matching
- Refine default patterns to reduce false positives:
  - Replace `**/*key*` with `**/*.key`, `**/*.pem`, `**/id_rsa*`, `**/id_ed25519*`
  - Replace `**/*token*` with `**/token*`, `**/*.token`
  - Replace `**/*secret*` with `**/secrets.*`, `**/.secrets*`
- Add a "test pattern" command that lets users check if a file path matches their patterns
- Log false-positive matches at debug level for troubleshooting

**Files to modify:** `src/riskAnalyzer.ts`, `src/settings.ts`, `package.json`

---

### 14. Add Configuration Validation and Migration

**Problem:** There's no validation of user settings beyond VS Code's schema. Invalid values silently fall back to defaults. No migration path exists when settings schema changes between versions.

**Proposal:**

- Add a `validateSettings()` function that checks for:
  - Invalid enum values
  - Conflicting rules (e.g., same pattern in both whitelist and blacklist)
  - Invalid glob patterns
  - Deprecated settings
- Show a notification on startup if settings have validation errors
- Add settings version field (`universalAutoAccept.configVersion`)
- Implement migration logic for version upgrades
- Add a command: `Validate Settings`

**Files to modify:** `src/settings.ts`, new file `src/settingsValidator.ts`

---

### 15. Add Cline / Cursor / Windsurf / Continue Adapters

**Problem:** The [`AdapterSettingsConfig`](src/types.ts:172) lists `cline`, `cursor`, `windsurf`, `continueExt` but no adapters exist for them. The [`knownExtensions`](src/adapterRegistry.ts:19) list includes some but they fall back to the generic adapter.

**Proposal:**

- Create dedicated adapters for popular AI assistants:
  - `clineAdapter.ts` for Cline (`saoudrizwan.claude-dev`)
  - `cursorAdapter.ts` for Cursor (if detectable)
  - `continueAdapter.ts` for Continue (`continue.continue`)
- Each adapter should attempt API connection like [`RooCodeAdapter.tryConnectAPI()`](src/adapters/rooAdapter.ts:30)
- Fall back to file-watcher mode if no API is available
- Add extension ID mappings in `adapterRegistry.ts`

**Files to modify:** new files in `src/adapters/`, `src/adapterRegistry.ts`, `package.json`

---

## 🔵 Infrastructure & Quality

### 16. Add Unit and Integration Tests

**Problem:** No test files exist in the project. The codebase has complex logic in `RiskAnalyzer`, `ApprovalEngine`, and `Settings` that should be tested.

**Proposal:**

- Set up test framework: `@vscode/test-electron` + `mocha` or `vitest`
- Priority test targets:
  - `RiskAnalyzer.analyze()` — test all risk levels and edge cases
  - `ApprovalEngine.processAction()` — test approval/denial flows
  - `Settings.loadSettings()` — test config loading and defaults
  - Glob pattern matching in `RiskAnalyzer.matchGlobPattern()`
  - Adapter registration and selection in `AdapterRegistry`
- Add `npm test` script to `package.json`
- Add GitHub Actions CI workflow

**Files to modify:** `package.json`, new `src/test/` directory

---

### 17. Add Telemetry (Opt-In)

**Problem:** No usage data is collected. It's impossible to know which features are used, what adapters are popular, or where users encounter issues.

**Proposal:**

- Use `@vscode/extension-telemetry` package (respects VS Code's telemetry setting)
- Track events:
  - Extension activation/deactivation
  - Adapter detection and selection
  - Action approval/denial counts (no file paths or content)
  - Feature usage (diff preview, undo, batch operations)
  - Settings changes
- Make telemetry fully opt-in via `universalAutoAccept.enableTelemetry` setting
- Document what is and isn't collected in README

**Files to modify:** new file `src/telemetry.ts`, `src/extension.ts`, `package.json`

---

### 18. Improve Error Handling and Resilience

**Problem:** Several areas have minimal error handling:

- [`handleAsk()`](src/approvalEngine.ts:178) fires a notification but returns `ApprovalState.Ask` immediately without waiting for user response
- Adapter API calls in [`RooCodeAdapter`](src/adapters/rooAdapter.ts:16) catch errors but silently return `true`
- No retry logic for failed adapter communications

**Proposal:**

- Make `handleAsk()` properly await user response before returning
- Add retry logic (with configurable max retries) for adapter API calls
- Add circuit breaker pattern: if an adapter fails N times, disable it temporarily
- Add error categorization (transient vs permanent)
- Show actionable error messages to users

**Files to modify:** `src/approvalEngine.ts`, `src/adapters/rooAdapter.ts`, `src/adapters/kiloAdapter.ts`

---

## 📋 Summary Priority Matrix

| #   | Enhancement                           | Impact    | Effort | Priority |
| --- | ------------------------------------- | --------- | ------ | -------- |
| 1   | Action History & Analytics            | 🔴 High   | Medium | P0       |
| 2   | Workspace Config (`.omniaccept.json`) | 🔴 High   | Medium | P0       |
| 3   | Conditional Rules Engine              | 🔴 High   | Medium | P0       |
| 4   | Terminal Whitelist/Blacklist          | 🔴 High   | Medium | P0       |
| 5   | Git-Based Undo                        | 🟡 Medium | Low    | P1       |
| 6   | Audio Notifications                   | 🟡 Medium | Low    | P1       |
| 7   | File-Level Approval                   | 🟡 Medium | Low    | P1       |
| 8   | Keyboard Shortcuts                    | 🟡 Medium | Low    | P1       |
| 9   | Rate Limiting                         | 🟡 Medium | Medium | P1       |
| 10  | Debounce/Coalescing                   | 🟢 Low    | Low    | P2       |
| 11  | Tree View                             | 🟢 Low    | Medium | P2       |
| 12  | Session Auto-Approve Budget           | 🟢 Low    | Low    | P2       |
| 13  | Better Glob Matching                  | 🟢 Low    | Low    | P2       |
| 14  | Config Validation & Migration         | 🟢 Low    | Low    | P2       |
| 15  | More Adapters                         | 🟢 Low    | Medium | P2       |
| 16  | Tests                                 | 🔴 High   | High   | P1       |
| 17  | Telemetry                             | 🟡 Medium | Low    | P2       |
| 18  | Error Handling                        | 🟡 Medium | Medium | P1       |

---

_Generated from codebase analysis on 2026-04-22_
