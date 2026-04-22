/**
 * Main test entry point
 * Imports all test suites and runs them
 */

// Import test framework
import { runTests } from "./runTest";

// Import test suites — each file registers its suites via describe()
import "./types.test";
import "./riskAnalyzer.test";
import "./settingsValidator.test";

// Run all tests
runTests().catch((error: unknown) => {
  console.error("Test runner failed:", error);
  process.exit(1);
});
