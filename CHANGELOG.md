# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2024-01-01

### Added

- **Core Functionality**
  - Auto-approve safe actions (read, edit files) based on risk analysis
  - Risk-based approval system (Low/Medium/High)
  - Batch processing for related actions
  - Undo support for last approved batch

- **Adapter System**
  - Roo Code adapter for native integration
  - Kilo Code adapter for native integration
  - Generic file-watching adapter (fallback)
  - Extensible adapter registry

- **Action Type Support**
  - Read Files, Edit Files, Create Files
  - Delete Files, Rename Files
  - Terminal Commands, Browser Tools
  - MCP Tool Access, External Directory Access
  - Sensitive File Access protection

- **User Interface**
  - Status bar indicator (ON/ASK/OFF modes)
  - Command Palette commands
  - Desktop notifications
  - Diff preview webview

- **Configuration**
  - 20+ configurable settings
  - Per-action-type approval rules
  - Sensitive file pattern customization
  - Trusted workspace mode

- **Documentation**
  - Comprehensive README
  - LIMITATIONS.md document
  - CONTRIBUTING.md guidelines
  - sample-settings.json reference

---

## [Unreleased]

### Planned Features

- [ ] VS Code Marketplace publication
- [ ] Dark/light theme support in webviews
- [ ] Persistent approval memory across sessions
- [ ] Extension health check system
- [ ] Action history and analytics
- [ ] Custom risk profiles
- [ ] Team/workspace-level policies

### Known Limitations

This extension operates within VS Code's public API. See [LIMITATIONS.md](./LIMITATIONS.md) for details.

---

## Version History

| Version | Date | Status |
|---------|------|--------|
| 1.0.0 | 2024-01-01 | Initial Release |

---

*This changelog was generated using [git-changelog](https://github.com/omni-enterprise/git-changelog) principles.*