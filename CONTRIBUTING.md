# 🤝 Contributing to Universal Auto Accept

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

---

## 📋 Table of Contents

- [Code of Conduct](#-code-of-conduct)
- [Getting Started](#-getting-started)
- [Development Setup](#-development-setup)
- [Making Changes](#-making-changes)
- [Submitting Changes](#-submitting-changes)
- [Code Standards](#-code-standards)
- [Reporting Issues](#-reporting-issues)

---

## 📖 Code of Conduct

We follow the [Contributor Covenant](https://www.contributor-covariant.org/). By participating, you agree to uphold this code.

**Be Respectful** — Treat others with courtesy. Disagreements happen, but be constructive.

**Be Inclusive** — Welcome everyone. We're better together.

**Be Professional** — Keep feedback constructive, not personal.

---

## 🚀 Getting Started

1. **Fork** the repository
2. **Clone** your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/universal-auto-accept.git
   cd universal-auto-accept
   ```
3. **Add upstream** remote:
   ```bash
   git remote add upstream https://github.com/omni-enterprise/universal-auto-accept.git
   ```

---

## 🔧 Development Setup

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | [Install Node.js](https://nodejs.org/) |
| npm | 9+ | Comes with Node.js |
| VS Code | 1.85+ | For testing the extension |

### Install Dependencies

```bash
npm install
```

### Build Commands

| Command | Description |
|---------|-------------|
| `npm run compile` | Compile TypeScript → JavaScript |
| `npm run watch` | Watch mode (auto-recompile on changes) |
| `npm run lint` | Run ESLint |
| `npm run package` | Create .vsix package |
| `npm test` | Run tests (if any) |

### Testing Your Changes

1. **Open in VS Code:**
   ```bash
   code .
   ```

2. **Run the extension:**
   - Press `F5` to launch Extension Development Host
   - Or use `npm run watch` + reload the window

3. **Test your changes** in the development instance

4. **Package & install locally:**
   ```bash
   npm run package
   code --install-extension ./universal-auto-accept-*.vsix
   ```

---

## 🛠️ Making Changes

### Branch Strategy

```
main                  ← Production-ready code
├── feature/*         ← New features
├── fix/*             ← Bug fixes
├── refactor/*        ← Code improvements
└── docs/*            ← Documentation
```

### Workflow

1. **Create a branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** — follow the code standards below

3. **Test thoroughly** — ensure nothing breaks

4. **Commit** — use conventional commits:
   ```
   feat: add dark mode support
   fix: resolve issue with batch approval
   docs: update installation instructions
   refactor: simplify risk analyzer
   ```

5. **Push** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request** — see below

---

## 📤 Submitting Changes

### Pull Request Checklist

Before submitting, ensure:

- [ ] Code follows TypeScript strict mode
- [ ] `npm run lint` passes with no errors
- [ ] `npm run compile` succeeds
- [ ] Changes tested in VS Code
- [ ] Documentation updated (if applicable)
- [ ] Commit messages are clear and conventional

### PR Template

```markdown
## Description
Brief description of the changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How was this tested?

## Screenshots (if applicable)
Add screenshots or recordings here.

## Additional Context
Any other relevant information.
```

---

## 📐 Code Standards

### TypeScript

- **Strict mode** — all TypeScript compilation uses strict settings
- **Explicit types** — avoid `any`, use proper types
- **Descriptive names** — variables/functions should be self-documenting

### File Organization

```typescript
// ✅ DO: Clear structure with proper imports
import { Adapter } from './types';
import { Logger } from './logger';

export class MyAdapter implements Adapter {
  // ...
}

// ❌ DON'T: Unclear, missing types
export class A {
  // ...
}
```

### Comments

- Use JSDoc for public APIs and classes
- Explain *why*, not *what*
- Remove commented-out code

### Error Handling

- Always handle promise rejections
- Use meaningful error messages
- Log errors with context

```typescript
// ✅ DO
try {
  await performAction();
} catch (error) {
  logger.error('Action failed', { error, context: 'my-feature' });
}

// ❌ DON'T
try {
  await performAction();
} catch (e) {
  // nothing
}
```

---

## 🐛 Reporting Issues

### Before Opening an Issue

1. **Search** existing issues to avoid duplicates
2. **Update** to the latest version to see if it's fixed
3. **Reproduce** the issue consistently

### Issue Template

```markdown
## Description
Clear description of the issue.

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What should happen.

## Actual Behavior
What actually happens.

## Environment
- VS Code version:
- OS:
- Extension version:

## Additional Context
Screenshots, logs, etc.
```

### Security Issues

For security vulnerabilities, please **do not** open a public issue. Instead, contact us privately.

---

## 📚 Resources

- [VS Code Extension API Docs](https://code.visualstudio.com/api)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Extension Samples](https://github.com/microsoft/vscode-extension-samples)

---

## 💬 Getting Help

- **Issues** — Open a GitHub issue for bugs/questions
- **Discussions** — Use GitHub Discussions for ideas/questions
- **Discord** — Join our community server (link in README)

---

Thank you for contributing! 🎉