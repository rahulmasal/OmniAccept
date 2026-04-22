/**
 * Test runner for OmniAccept unit tests
 * This file sets up the test environment and runs all test suites
 */

// Simple test framework
interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}

interface TestSuite {
  name: string;
  cases: TestCase[];
}

const suites: TestSuite[] = [];
let currentSuite: TestSuite | null = null;

let passed = 0;
let failed = 0;
let errors: string[] = [];

function describe(name: string, fn: () => void): void {
  currentSuite = { name, cases: [] };
  suites.push(currentSuite);
  fn();
  currentSuite = null;
}

function it(name: string, fn: () => void | Promise<void>): void {
  if (currentSuite) {
    currentSuite.cases.push({ name, fn });
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message || "assertEqual failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertNotEqual<T>(actual: T, unexpected: T, message?: string): void {
  if (JSON.stringify(actual) === JSON.stringify(unexpected)) {
    throw new Error(
      `${message || "assertNotEqual failed"}: value should not equal ${JSON.stringify(unexpected)}`,
    );
  }
}

function assertTrue(condition: boolean, message?: string): void {
  if (!condition) {
    throw new Error(message || "Expected true, got false");
  }
}

function assertFalse(condition: boolean, message?: string): void {
  if (condition) {
    throw new Error(message || "Expected false, got true");
  }
}

function assertThrows(fn: () => void, message?: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error(message || "Expected function to throw");
  }
}

async function runTests(): Promise<void> {
  console.log("\n═══════════════════════════════════════════");
  console.log("  OmniAccept Unit Tests");
  console.log("═══════════════════════════════════════════\n");

  for (const suite of suites) {
    console.log(`📦 ${suite.name}`);

    for (const testCase of suite.cases) {
      try {
        await testCase.fn();
        passed++;
        console.log(`  ✅ ${testCase.name}`);
      } catch (error) {
        failed++;
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${suite.name} > ${testCase.name}: ${msg}`);
        console.log(`  ❌ ${testCase.name}`);
        console.log(`     ${msg}`);
      }
    }

    console.log("");
  }

  console.log("───────────────────────────────────────────");
  console.log(
    `  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`,
  );

  if (errors.length > 0) {
    console.log("\n  Failed tests:");
    errors.forEach((e) => console.log(`    - ${e}`));
  }

  console.log("───────────────────────────────────────────\n");

  if (failed > 0) {
    process.exit(1);
  }
}

// Export test utilities for use in test files
export {
  describe,
  it,
  assert,
  assertEqual,
  assertNotEqual,
  assertTrue,
  assertFalse,
  assertThrows,
  runTests,
  suites,
};
