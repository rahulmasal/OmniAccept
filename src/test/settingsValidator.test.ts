/**
 * Unit tests for SettingsValidator
 * Tests validation logic, migration, and config version handling
 */

import { describe, it, assertTrue, assertFalse, assertEqual } from "./runTest";
import { SettingsValidator } from "../settingsValidator";
import { ExtensionSettings, ApprovalState } from "../types";

// Helper to create valid default settings
function createDefaultSettings(
  overrides: Partial<ExtensionSettings> = {},
): ExtensionSettings {
  return {
    enabled: true,
    trustedWorkspaceOnly: true,
    defaultPolicy: ApprovalState.Ask,
    adapterSettings: {
      rooCode: true,
      kiloCode: true,
      cline: true,
      cursor: false,
      windsurf: false,
      continueExt: true,
    },
    actionRules: {
      readFiles: ApprovalState.Allow,
      editFiles: ApprovalState.Allow,
      createFiles: ApprovalState.Ask,
      deleteFiles: ApprovalState.Deny,
      renameFiles: ApprovalState.Ask,
      terminalCommand: ApprovalState.Deny,
      browserTool: ApprovalState.Deny,
      mcpToolAccess: ApprovalState.Deny,
      externalDirectoryAccess: ApprovalState.Deny,
      sensitiveFileAccess: ApprovalState.Deny,
    },
    sensitiveFilePatterns: ["**/.env", "**/.env.*", "**/*.pem", "**/*.key"],
    maxUndoBatchSize: 10,
    autoApproveDelay: 0,
    logLevel: "info",
    statusBarMode: "on",
    showNotifications: true,
    askModeTimeout: 300,
    audioNotifications: false,
    audioVolume: 50,
    useGitUndo: true,
    gitUndoDryRun: false,
    conditionalRules: [],
    terminalWhitelist: [],
    terminalBlacklist: [],
    maxAutoApprovesPerMinute: 30,
    maxAutoApprovesPerSession: 0,
    rateLimitAction: "ask",
    autoApproveBudget: 0,
    changeDebounceMs: 500,
    maxHistorySize: 500,
    ignoreWorkspaceConfig: false,
    enableTelemetry: false,
    configVersion: 1,
    ...overrides,
  };
}

describe("SettingsValidator - Valid Settings", () => {
  it("should pass validation for default settings", () => {
    const validator = SettingsValidator.getInstance();
    const settings = createDefaultSettings();
    const result = validator.validate(settings);
    assertTrue(result.isValid, "Default settings should be valid");
    assertEqual(result.errors.length, 0, "Should have no errors");
  });

  it("should pass validation with conditional rules", () => {
    const validator = SettingsValidator.getInstance();
    const settings = createDefaultSettings({
      conditionalRules: [
        { pattern: "**/src/**", policy: ApprovalState.Allow },
        { pattern: "**/secrets/**", policy: ApprovalState.Deny },
      ],
    });
    const result = validator.validate(settings);
    assertTrue(
      result.isValid,
      "Settings with valid conditional rules should be valid",
    );
  });

  it("should pass validation with terminal rules", () => {
    const validator = SettingsValidator.getInstance();
    const settings = createDefaultSettings({
      terminalWhitelist: [
        { pattern: "npm test", policy: ApprovalState.Allow },
        { pattern: "git status", policy: ApprovalState.Allow },
      ],
      terminalBlacklist: [{ pattern: "rm -rf", policy: ApprovalState.Deny }],
    });
    const result = validator.validate(settings);
    assertTrue(
      result.isValid,
      "Settings with valid terminal rules should be valid",
    );
  });
});

describe("SettingsValidator - Invalid Settings", () => {
  it("should fail for invalid defaultPolicy", () => {
    const validator = SettingsValidator.getInstance();
    const settings = createDefaultSettings({
      defaultPolicy: "invalid" as ApprovalState,
    });
    const result = validator.validate(settings);
    assertFalse(result.isValid, "Invalid defaultPolicy should fail validation");
    assertTrue(result.errors.length > 0, "Should have at least one error");
  });

  it("should fail for invalid numeric settings", () => {
    const validator = SettingsValidator.getInstance();
    const settings = createDefaultSettings({
      maxUndoBatchSize: -1,
    });
    const result = validator.validate(settings);
    assertFalse(
      result.isValid,
      "Negative maxUndoBatchSize should fail validation",
    );
  });

  it("should fail for autoApproveDelay out of range", () => {
    const validator = SettingsValidator.getInstance();
    const settings = createDefaultSettings({
      autoApproveDelay: 70000,
    });
    const result = validator.validate(settings);
    assertFalse(
      result.isValid,
      "autoApproveDelay > 60000 should fail validation",
    );
  });
});

describe("SettingsValidator - Warnings", () => {
  it("should warn about overly broad sensitive patterns", () => {
    const validator = SettingsValidator.getInstance();
    const settings = createDefaultSettings({
      sensitiveFilePatterns: ["**/*key*", "**/*secret*", "**/*token*"],
    });
    const result = validator.validate(settings);
    assertTrue(
      result.warnings.length > 0,
      "Broad patterns should generate warnings",
    );
  });

  it("should warn about conflicting terminal rules", () => {
    const validator = SettingsValidator.getInstance();
    const settings = createDefaultSettings({
      terminalWhitelist: [{ pattern: "npm *", policy: ApprovalState.Allow }],
      terminalBlacklist: [{ pattern: "npm *", policy: ApprovalState.Deny }],
    });
    const result = validator.validate(settings);
    assertTrue(
      result.warnings.length > 0,
      "Conflicting terminal rules should generate warnings",
    );
  });

  it("should not warn about specific sensitive patterns", () => {
    const validator = SettingsValidator.getInstance();
    const settings = createDefaultSettings({
      sensitiveFilePatterns: ["**/*.pem", "**/*.key", "**/secrets.json"],
    });
    const result = validator.validate(settings);
    const broadWarnings = result.warnings.filter(
      (w) => w.key === "sensitiveFilePatterns",
    );
    assertEqual(
      broadWarnings.length,
      0,
      "Specific patterns should not generate broad pattern warnings",
    );
  });
});

describe("SettingsValidator - Migration", () => {
  it("should migrate from version 0 to version 1", () => {
    const validator = SettingsValidator.getInstance();
    const oldSettings: Record<string, unknown> = {
      enabled: true,
      defaultPolicy: "ask",
    };
    const migrated = validator.migrate(oldSettings, 0);
    assertEqual(
      migrated.configVersion,
      1,
      "Migrated config should have version 1",
    );
    assertEqual(migrated.audioVolume, 50, "Should add default audioVolume");
    assertEqual(
      migrated.maxAutoApprovesPerMinute,
      30,
      "Should add default rate limit",
    );
    assertEqual(
      migrated.enableTelemetry,
      false,
      "Should add default telemetry setting",
    );
  });

  it("should preserve existing values during migration", () => {
    const validator = SettingsValidator.getInstance();
    const oldSettings: Record<string, unknown> = {
      enabled: true,
      audioVolume: 75,
      maxAutoApprovesPerMinute: 10,
    };
    const migrated = validator.migrate(oldSettings, 0);
    assertEqual(
      migrated.audioVolume,
      75,
      "Should preserve existing audioVolume",
    );
    assertEqual(
      migrated.maxAutoApprovesPerMinute,
      10,
      "Should preserve existing rate limit",
    );
  });

  it("should return current config version", () => {
    const validator = SettingsValidator.getInstance();
    const version = validator.getConfigVersion();
    assertTrue(version >= 1, "Config version should be at least 1");
  });
});
