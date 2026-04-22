/**
 * Unit tests for Types and Enums
 * Verifies enum values and type consistency
 */

import { describe, it, assertTrue, assertEqual } from "./runTest";
import {
  ActionType,
  ApprovalState,
  RiskLevel,
  BatchStatus,
  TelemetryEvent,
  TreeItemType,
  RateLimitAction,
} from "../types";

describe("Types - ActionType Enum", () => {
  it("should have all expected action types", () => {
    const expected: string[] = [
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
    const actual = Object.values(ActionType) as string[];
    assertEqual(
      actual.length,
      expected.length,
      "Should have correct number of action types",
    );
    for (const val of expected) {
      assertTrue(actual.includes(val), `ActionType should include "${val}"`);
    }
  });
});

describe("Types - ApprovalState Enum", () => {
  it("should have Allow, Ask, Deny states", () => {
    assertEqual(ApprovalState.Allow, "allow", 'Allow should be "allow"');
    assertEqual(ApprovalState.Ask, "ask", 'Ask should be "ask"');
    assertEqual(ApprovalState.Deny, "deny", 'Deny should be "deny"');
  });
});

describe("Types - RiskLevel Enum", () => {
  it("should have Low, Medium, High levels", () => {
    assertEqual(RiskLevel.Low, "low", 'Low should be "low"');
    assertEqual(RiskLevel.Medium, "medium", 'Medium should be "medium"');
    assertEqual(RiskLevel.High, "high", 'High should be "high"');
  });
});

describe("Types - BatchStatus Enum", () => {
  it("should have Pending, Approved, Rejected statuses", () => {
    const values = Object.values(BatchStatus) as string[];
    assertTrue(values.includes("pending"), "Should include pending");
    assertTrue(values.includes("approved"), "Should include approved");
    assertTrue(values.includes("rejected"), "Should include rejected");
  });
});

describe("Types - TelemetryEvent Enum", () => {
  it("should have all expected telemetry events", () => {
    const events = Object.values(TelemetryEvent) as string[];
    assertTrue(
      events.length >= 10,
      "Should have at least 10 telemetry event types",
    );
    assertTrue(
      events.includes("extension.activated"),
      "Should include extension.activated",
    );
    assertTrue(
      events.includes("extension.deactivated"),
      "Should include extension.deactivated",
    );
    assertTrue(
      events.includes("action.approved"),
      "Should include action.approved",
    );
    assertTrue(
      events.includes("action.denied"),
      "Should include action.denied",
    );
  });
});

describe("Types - TreeItemType Enum", () => {
  it("should have Adapter, PendingAction, BatchHistory, BatchEntry types", () => {
    assertEqual(TreeItemType.Adapter, "adapter", 'Adapter should be "adapter"');
    assertEqual(
      TreeItemType.PendingAction,
      "pendingAction",
      'PendingAction should be "pendingAction"',
    );
    assertEqual(
      TreeItemType.BatchHistory,
      "batchHistory",
      'BatchHistory should be "batchHistory"',
    );
    assertEqual(
      TreeItemType.BatchEntry,
      "batchEntry",
      'BatchEntry should be "batchEntry"',
    );
  });
});

describe("Types - RateLimitAction Type", () => {
  it("should have ask, pause, off values", () => {
    const values: RateLimitAction[] = ["ask", "pause", "off"];
    assertEqual(values.length, 3, "Should have 3 rate limit actions");
    assertTrue(values.includes("ask"), "Should include ask");
    assertTrue(values.includes("pause"), "Should include pause");
    assertTrue(values.includes("off"), "Should include off");
  });
});
