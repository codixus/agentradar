import { describe, expect, test } from "bun:test";
import { computeScore } from "./scoring.ts";
import type { CheckResult } from "./types.ts";

function result(overrides: Partial<CheckResult>): CheckResult {
  return {
    id: "test-check",
    title: "Test check",
    category: "test",
    severityTier: "error",
    passed: true,
    evidence: "",
    ...overrides,
  };
}

describe("computeScore", () => {
  test("no checks at all yields a perfect score (nothing to fail)", () => {
    expect(computeScore([])).toEqual({ score: 100, grade: "A" });
  });

  test("no error-tier checks present yields a perfect score regardless of warning/notice failures", () => {
    const checks = [
      result({ severityTier: "warning", passed: false }),
      result({ severityTier: "notice", passed: false }),
    ];
    expect(computeScore(checks)).toEqual({ score: 100, grade: "A" });
  });

  test("all error-tier checks passing yields a perfect score", () => {
    const checks = [
      result({ severityTier: "error", passed: true }),
      result({ severityTier: "error", passed: true }),
    ];
    expect(computeScore(checks)).toEqual({ score: 100, grade: "A" });
  });

  test("all error-tier checks failing yields the lowest grade", () => {
    const checks = [
      result({ severityTier: "error", passed: false }),
      result({ severityTier: "error", passed: false }),
    ];
    const { score, grade } = computeScore(checks);
    expect(score).toBe(0);
    expect(grade).toBe("F");
  });

  test("warning/notice-tier failures never affect the score, only error-tier does", () => {
    const withWarnings = [
      result({ severityTier: "error", passed: true }),
      result({ severityTier: "warning", passed: false }),
      result({ severityTier: "notice", passed: false }),
    ];
    const withoutWarnings = [result({ severityTier: "error", passed: true })];
    expect(computeScore(withWarnings)).toEqual(computeScore(withoutWarnings));
  });

  test("a half-passing error tier yields a mid score", () => {
    const checks = [
      result({ severityTier: "error", passed: true }),
      result({ severityTier: "error", passed: false }),
    ];
    const { score } = computeScore(checks);
    expect(score).toBe(50);
  });
});
