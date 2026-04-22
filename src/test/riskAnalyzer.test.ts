/**
 * Unit tests for RiskAnalyzer
 * Tests pattern matching, risk analysis, and terminal rules logic
 */

import { describe, it, assertTrue, assertFalse, assertEqual } from "./runTest";
import { RiskAnalyzer } from "../riskAnalyzer";
import { ActionContext, ActionType, RiskLevel, ApprovalState } from "../types";

// Helper to create a minimal ActionContext
function createAction(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    id: "test-action-1",
    type: ActionType.EditFiles,
    description: "Test action",
    files: [],
    isWorkspaceFile: true,
    isSensitiveFile: false,
    adapterName: "TestAdapter",
    timestamp: new Date(),
    riskLevel: RiskLevel.Low,
    requiredApproval: ApprovalState.Ask,
    ...overrides,
  };
}

describe("RiskAnalyzer - Pattern Matching", () => {
  it("should match exact file names", () => {
    const analyzer = RiskAnalyzer.getInstance();
    const result = analyzer.testPattern(".env", "**/.env");
    assertTrue(result, "Should match .env with **/.env pattern");
  });

  it("should match wildcard patterns", () => {
    const analyzer = RiskAnalyzer.getInstance();
    const result = analyzer.testPattern(
      "config/secrets.json",
      "**/secrets.json",
    );
    assertTrue(result, "Should match nested file with ** prefix");
  });

  it("should match extension patterns", () => {
    const analyzer = RiskAnalyzer.getInstance();
    const result = analyzer.testPattern("server.key", "**/*.key");
    assertTrue(result, "Should match .key extension pattern");
  });

  it("should not match non-sensitive files", () => {
    const analyzer = RiskAnalyzer.getInstance();
    const result = analyzer.testPattern("src/index.ts", "**/*.key");
    assertFalse(result, "Should not match .ts file with .key pattern");
  });

  it("should match .env variants", () => {
    const analyzer = RiskAnalyzer.getInstance();
    assertTrue(analyzer.testPattern(".env", "**/.env"), "Should match .env");
    assertTrue(
      analyzer.testPattern(".env.local", "**/.env.*"),
      "Should match .env.local",
    );
    assertTrue(
      analyzer.testPattern(".env.production", "**/.env.*"),
      "Should match .env.production",
    );
  });

  it("should match SSH key patterns", () => {
    const analyzer = RiskAnalyzer.getInstance();
    assertTrue(
      analyzer.testPattern(".ssh/id_rsa", "**/.ssh/**"),
      "Should match .ssh/id_rsa",
    );
    assertTrue(
      analyzer.testPattern(".ssh/id_ed25519", "**/.ssh/**"),
      "Should match .ssh/id_ed25519",
    );
  });

  it("should match credential file patterns", () => {
    const analyzer = RiskAnalyzer.getInstance();
    assertTrue(
      analyzer.testPattern("secrets.json", "**/secrets.json"),
      "Should match secrets.json",
    );
    assertTrue(
      analyzer.testPattern("secrets.yaml", "**/secrets.yaml"),
      "Should match secrets.yaml",
    );
  });
});

describe("RiskAnalyzer - Action Type Risk Assessment", () => {
  it("should assign low risk to read operations", () => {
    const analyzer = RiskAnalyzer.getInstance();
    const action = createAction({ type: ActionType.ReadFiles });
    const result = analyzer.analyze(action);
    assertTrue(
      result.level === RiskLevel.Low || result.level === RiskLevel.Medium,
      `ReadFiles should be Low or Medium risk, got ${result.level}`,
    );
  });

  it("should assign higher risk to delete operations", () => {
    const analyzer = RiskAnalyzer.getInstance();
    const action = createAction({ type: ActionType.DeleteFiles });
    const result = analyzer.analyze(action);
    assertTrue(
      result.level === RiskLevel.High || result.level === RiskLevel.Medium,
      `DeleteFiles should be Medium or High risk, got ${result.level}`,
    );
  });

  it("should assign high risk to destructive terminal commands", () => {
    const analyzer = RiskAnalyzer.getInstance();
    const destructiveCommands = [
      "rm -rf /",
      "sudo rm -rf /var",
      "shutdown -h now",
      "reboot",
      "mkfs.ext4 /dev/sda1",
      "dd if=/dev/zero of=/dev/sda",
      "chmod -R 777 /",
    ];

    for (const cmd of destructiveCommands) {
      const action = createAction({
        type: ActionType.TerminalCommand,
        command: cmd,
      });
      const result = analyzer.analyze(action);
      assertTrue(
        result.level === RiskLevel.High,
        `"${cmd}" should be High risk, got ${result.level}`,
      );
    }
  });

  it("should assign high risk to sensitive file access", () => {
    const analyzer = RiskAnalyzer.getInstance();
    const action = createAction({
      type: ActionType.SensitiveFileAccess,
      files: ["/home/user/.ssh/id_rsa"],
      isSensitiveFile: true,
    });
    const result = analyzer.analyze(action);
    assertTrue(
      result.level === RiskLevel.High,
      `SensitiveFileAccess should be High risk, got ${result.level}`,
    );
  });
});

describe("RiskAnalyzer - Risk to Approval State Mapping", () => {
  it("should map Low risk to Allow", () => {
    const analyzer = RiskAnalyzer.getInstance();
    const result = analyzer.riskToApprovalState({
      level: RiskLevel.Low,
      reasons: [],
    });
    assertEqual(result, ApprovalState.Allow, "Low risk should map to Allow");
  });

  it("should map Medium risk to Ask", () => {
    const analyzer = RiskAnalyzer.getInstance();
    const result = analyzer.riskToApprovalState({
      level: RiskLevel.Medium,
      reasons: [],
    });
    assertEqual(result, ApprovalState.Ask, "Medium risk should map to Ask");
  });

  it("should map High risk to Deny", () => {
    const analyzer = RiskAnalyzer.getInstance();
    const result = analyzer.riskToApprovalState({
      level: RiskLevel.High,
      reasons: [],
    });
    assertEqual(result, ApprovalState.Deny, "High risk should map to Deny");
  });
});

describe("RiskAnalyzer - Quick Analysis", () => {
  it("should identify sensitive files via quickAnalyze", () => {
    const analyzer = RiskAnalyzer.getInstance();
    const sensitiveResult = analyzer.quickAnalyze(ActionType.EditFiles, [
      ".env",
    ]);
    assertTrue(
      sensitiveResult.level === RiskLevel.High ||
        sensitiveResult.level === RiskLevel.Medium,
      ".env should be elevated risk level",
    );
  });

  it("should return lower risk for normal files via quickAnalyze", () => {
    const analyzer = RiskAnalyzer.getInstance();
    const normalResult = analyzer.quickAnalyze(ActionType.ReadFiles, [
      "src/index.ts",
    ]);
    assertTrue(
      normalResult.level === RiskLevel.Low,
      "Normal file read should be Low risk",
    );
  });
});
