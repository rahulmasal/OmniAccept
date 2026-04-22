import {
  ExtensionSettings,
  SettingsValidationResult,
  SettingsValidationError,
  SettingsValidationWarning,
  ApprovalState,
  ActionType,
  ConditionalRule,
  TerminalRule,
} from "./types";
import { getLogger } from "./logger";

/**
 * Validates extension settings and provides migration support
 */
export class SettingsValidator {
  private static instance: SettingsValidator;
  private currentConfigVersion = 1;

  private constructor() {}

  public static getInstance(): SettingsValidator {
    if (!SettingsValidator.instance) {
      SettingsValidator.instance = new SettingsValidator();
    }
    return SettingsValidator.instance;
  }

  /**
   * Validate the full settings object
   */
  public validate(settings: ExtensionSettings): SettingsValidationResult {
    const errors: SettingsValidationError[] = [];
    const warnings: SettingsValidationWarning[] = [];

    // Validate enabled
    if (typeof settings.enabled !== "boolean") {
      errors.push({
        key: "enabled",
        message: "Must be a boolean",
        value: settings.enabled,
      });
    }

    // Validate trustedWorkspaceOnly
    if (typeof settings.trustedWorkspaceOnly !== "boolean") {
      errors.push({
        key: "trustedWorkspaceOnly",
        message: "Must be a boolean",
        value: settings.trustedWorkspaceOnly,
      });
    }

    // Validate defaultPolicy
    const validPolicies: string[] = [
      ApprovalState.Allow,
      ApprovalState.Ask,
      ApprovalState.Deny,
    ];
    if (!validPolicies.includes(settings.defaultPolicy)) {
      errors.push({
        key: "defaultPolicy",
        message: `Must be one of: ${validPolicies.join(", ")}`,
        value: settings.defaultPolicy,
      });
    }

    // Validate action rules
    this.validateActionRules(settings, errors);

    // Validate conditional rules
    this.validateConditionalRules(settings.conditionalRules, errors, warnings);

    // Validate terminal rules
    this.validateTerminalRules(
      settings.terminalWhitelist,
      "terminalWhitelist",
      errors,
      warnings,
    );
    this.validateTerminalRules(
      settings.terminalBlacklist,
      "terminalBlacklist",
      errors,
      warnings,
    );

    // Check for conflicting whitelist/blacklist entries
    this.checkTerminalRuleConflicts(settings, warnings);

    // Validate sensitive file patterns
    this.validateSensitivePatterns(settings.sensitiveFilePatterns, warnings);

    // Validate numeric settings
    this.validateNumericSetting(
      settings.maxUndoBatchSize,
      "maxUndoBatchSize",
      1,
      1000,
      errors,
    );
    this.validateNumericSetting(
      settings.autoApproveDelay,
      "autoApproveDelay",
      0,
      60000,
      errors,
    );
    this.validateNumericSetting(
      settings.askModeTimeout,
      "askModeTimeout",
      0,
      3600,
      errors,
    );
    this.validateNumericSetting(
      settings.maxAutoApprovesPerMinute,
      "maxAutoApprovesPerMinute",
      0,
      1000,
      errors,
    );
    this.validateNumericSetting(
      settings.maxAutoApprovesPerSession,
      "maxAutoApprovesPerSession",
      0,
      100000,
      errors,
    );
    this.validateNumericSetting(
      settings.autoApproveBudget,
      "autoApproveBudget",
      0,
      100000,
      errors,
    );
    this.validateNumericSetting(
      settings.changeDebounceMs,
      "changeDebounceMs",
      0,
      10000,
      errors,
    );
    this.validateNumericSetting(
      settings.maxHistorySize,
      "maxHistorySize",
      10,
      10000,
      errors,
    );
    this.validateNumericSetting(
      settings.audioVolume,
      "audioVolume",
      0,
      100,
      errors,
    );

    // Validate log level
    const validLogLevels = ["off", "error", "warn", "info", "debug"];
    if (!validLogLevels.includes(settings.logLevel)) {
      errors.push({
        key: "logLevel",
        message: `Must be one of: ${validLogLevels.join(", ")}`,
        value: settings.logLevel,
      });
    }

    // Validate status bar mode
    const validModes = ["on", "ask", "off"];
    if (!validModes.includes(settings.statusBarMode)) {
      errors.push({
        key: "statusBarMode",
        message: `Must be one of: ${validModes.join(", ")}`,
        value: settings.statusBarMode,
      });
    }

    // Validate rate limit action
    const validRateLimitActions = ["ask", "pause", "off"];
    if (!validRateLimitActions.includes(settings.rateLimitAction)) {
      errors.push({
        key: "rateLimitAction",
        message: `Must be one of: ${validRateLimitActions.join(", ")}`,
        value: settings.rateLimitAction,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate action rules
   */
  private validateActionRules(
    settings: ExtensionSettings,
    errors: SettingsValidationError[],
  ): void {
    const validKeys = [
      "readFiles",
      "editFiles",
      "createFiles",
      "deleteFiles",
      "renameFiles",
      "terminalCommand",
      "browserTool",
      "mcpToolAccess",
      "externalDirectoryAccess",
      "sensitiveFileAccess",
    ];
    const validPolicies = [
      ApprovalState.Allow,
      ApprovalState.Ask,
      ApprovalState.Deny,
    ];

    const rules = settings.actionRules as unknown as Record<string, unknown>;
    for (const key of validKeys) {
      const value = rules[key];
      if (
        value !== undefined &&
        !validPolicies.includes(value as ApprovalState)
      ) {
        errors.push({
          key: `actionRules.${key}`,
          message: `Must be one of: ${validPolicies.join(", ")}`,
          value,
        });
      }
    }
  }

  /**
   * Validate conditional rules
   */
  private validateConditionalRules(
    rules: ConditionalRule[],
    errors: SettingsValidationError[],
    warnings: SettingsValidationWarning[],
  ): void {
    if (!Array.isArray(rules)) {
      return;
    }

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];

      if (!rule.pattern || typeof rule.pattern !== "string") {
        errors.push({
          key: `conditionalRules[${i}].pattern`,
          message: "Pattern must be a non-empty string",
          value: rule.pattern,
        });
      }

      const validPolicies = [
        ApprovalState.Allow,
        ApprovalState.Ask,
        ApprovalState.Deny,
      ];
      if (!validPolicies.includes(rule.policy)) {
        errors.push({
          key: `conditionalRules[${i}].policy`,
          message: `Must be one of: ${validPolicies.join(", ")}`,
          value: rule.policy,
        });
      }

      if (rule.actionType) {
        const validActionTypes = Object.values(ActionType);
        if (!validActionTypes.includes(rule.actionType)) {
          errors.push({
            key: `conditionalRules[${i}].actionType`,
            message: `Must be one of: ${validActionTypes.join(", ")}`,
            value: rule.actionType,
          });
        }
      }

      // Warn about overly broad patterns
      if (rule.pattern === "**" || rule.pattern === "*") {
        warnings.push({
          key: `conditionalRules[${i}].pattern`,
          message: "Pattern matches all files — this may override other rules",
          value: rule.pattern,
        });
      }
    }
  }

  /**
   * Validate terminal rules
   */
  private validateTerminalRules(
    rules: TerminalRule[],
    keyPrefix: string,
    errors: SettingsValidationError[],
    _warnings: SettingsValidationWarning[],
  ): void {
    if (!Array.isArray(rules)) {
      return;
    }

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];

      if (!rule.pattern || typeof rule.pattern !== "string") {
        errors.push({
          key: `${keyPrefix}[${i}].pattern`,
          message: "Pattern must be a non-empty string",
          value: rule.pattern,
        });
      }

      const validPolicies = [
        ApprovalState.Allow,
        ApprovalState.Ask,
        ApprovalState.Deny,
      ];
      if (!validPolicies.includes(rule.policy)) {
        errors.push({
          key: `${keyPrefix}[${i}].policy`,
          message: `Must be one of: ${validPolicies.join(", ")}`,
          value: rule.policy,
        });
      }
    }
  }

  /**
   * Check for conflicting terminal whitelist/blacklist entries
   */
  private checkTerminalRuleConflicts(
    settings: ExtensionSettings,
    warnings: SettingsValidationWarning[],
  ): void {
    if (
      !Array.isArray(settings.terminalWhitelist) ||
      !Array.isArray(settings.terminalBlacklist)
    ) {
      return;
    }

    for (const whitelistRule of settings.terminalWhitelist) {
      for (const blacklistRule of settings.terminalBlacklist) {
        if (whitelistRule.pattern === blacklistRule.pattern) {
          warnings.push({
            key: "terminalWhitelist/terminalBlacklist",
            message: `Pattern "${whitelistRule.pattern}" appears in both whitelist and blacklist`,
            value: whitelistRule.pattern,
          });
        }
      }
    }
  }

  /**
   * Validate sensitive file patterns
   */
  private validateSensitivePatterns(
    patterns: string[],
    warnings: SettingsValidationWarning[],
  ): void {
    if (!Array.isArray(patterns)) {
      return;
    }

    // Warn about overly broad patterns
    const broadPatterns = [
      "**/*key*",
      "**/*token*",
      "**/*secret*",
      "**/*password*",
    ];
    for (const pattern of patterns) {
      if (broadPatterns.includes(pattern)) {
        warnings.push({
          key: "sensitiveFilePatterns",
          message: `Pattern "${pattern}" is very broad and may cause false positives. Consider more specific patterns like "**/*.key" or "**/secrets.*"`,
          value: pattern,
        });
      }
    }
  }

  /**
   * Validate a numeric setting within bounds
   */
  private validateNumericSetting(
    value: number,
    key: string,
    min: number,
    max: number,
    errors: SettingsValidationError[],
  ): void {
    if (typeof value !== "number" || isNaN(value)) {
      errors.push({ key, message: "Must be a number", value });
      return;
    }
    if (value < min || value > max) {
      errors.push({
        key,
        message: `Must be between ${min} and ${max}`,
        value,
      });
    }
  }

  /**
   * Migrate settings from an older config version
   */
  public migrate(
    settings: Record<string, unknown>,
    fromVersion: number,
  ): Record<string, unknown> {
    const logger = getLogger();
    let migrated = { ...settings };

    if (fromVersion < 1) {
      // Migration from version 0 (no configVersion) to version 1
      logger.info("Migrating settings from version 0 to version 1");

      // Add new fields with defaults if missing
      if (migrated.audioVolume === undefined) {
        migrated.audioVolume = 50;
      }
      if (migrated.gitUndoDryRun === undefined) {
        migrated.gitUndoDryRun = false;
      }
      if (migrated.maxAutoApprovesPerMinute === undefined) {
        migrated.maxAutoApprovesPerMinute = 30;
      }
      if (migrated.maxAutoApprovesPerSession === undefined) {
        migrated.maxAutoApprovesPerSession = 0;
      }
      if (migrated.rateLimitAction === undefined) {
        migrated.rateLimitAction = "ask";
      }
      if (migrated.autoApproveBudget === undefined) {
        migrated.autoApproveBudget = 0;
      }
      if (migrated.changeDebounceMs === undefined) {
        migrated.changeDebounceMs = 500;
      }
      if (migrated.maxHistorySize === undefined) {
        migrated.maxHistorySize = 500;
      }
      if (migrated.ignoreWorkspaceConfig === undefined) {
        migrated.ignoreWorkspaceConfig = false;
      }
      if (migrated.enableTelemetry === undefined) {
        migrated.enableTelemetry = false;
      }
      if (migrated.conditionalRules === undefined) {
        migrated.conditionalRules = [];
      }
      if (migrated.terminalWhitelist === undefined) {
        migrated.terminalWhitelist = [];
      }
      if (migrated.terminalBlacklist === undefined) {
        migrated.terminalBlacklist = [];
      }

      migrated.configVersion = 1;
    }

    return migrated;
  }

  /**
   * Get current config version
   */
  public getConfigVersion(): number {
    return this.currentConfigVersion;
  }
}

/**
 * Get the SettingsValidator singleton
 */
export function getSettingsValidator(): SettingsValidator {
  return SettingsValidator.getInstance();
}
