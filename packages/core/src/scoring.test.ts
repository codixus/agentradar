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

  test("only notice/inferred checks present yields a perfect score (nascent specs never move the headline)", () => {
    const checks = [
      result({ severityTier: "notice", passed: false }),
      result({ severityTier: "error", passed: false, inferred: true }),
    ];
    expect(computeScore(checks)).toEqual({ score: 100, grade: "A" });
  });

  test("all scored checks passing yields a perfect score", () => {
    const checks = [
      result({ severityTier: "error", passed: true }),
      result({ severityTier: "warning", passed: true }),
    ];
    expect(computeScore(checks)).toEqual({ score: 100, grade: "A" });
  });

  test("all scored checks failing yields the lowest grade", () => {
    const checks = [
      result({ severityTier: "error", passed: false }),
      result({ severityTier: "warning", passed: false }),
    ];
    const { score, grade } = computeScore(checks);
    expect(score).toBe(0);
    expect(grade).toBe("F");
  });

  test("a failing warning-tier check now lowers the score (it is no longer ignored)", () => {
    const checks = [
      result({ severityTier: "error", passed: true }),
      result({ severityTier: "warning", passed: false }),
    ];
    // error weight 2 (passing) out of total weight 3 -> 67
    expect(computeScore(checks).score).toBe(67);
  });

  test("error tier is weighted twice as heavily as warning tier", () => {
    const errorPassWarnFail = [
      result({ severityTier: "error", passed: true }),
      result({ severityTier: "warning", passed: false }),
    ];
    const errorFailWarnPass = [
      result({ severityTier: "error", passed: false }),
      result({ severityTier: "warning", passed: true }),
    ];
    // 2/3 vs 1/3 -- the same pass count weighs differently by tier
    expect(computeScore(errorPassWarnFail).score).toBe(67);
    expect(computeScore(errorFailWarnPass).score).toBe(33);
  });

  test("notice-tier failures never affect the score, only error/warning tiers do", () => {
    const withNotice = [
      result({ severityTier: "error", passed: true }),
      result({ severityTier: "warning", passed: true }),
      result({ severityTier: "notice", passed: false }),
    ];
    const withoutNotice = [
      result({ severityTier: "error", passed: true }),
      result({ severityTier: "warning", passed: true }),
    ];
    expect(computeScore(withNotice)).toEqual(computeScore(withoutNotice));
  });

  test("inferred checks are excluded even when they sit in a scored tier", () => {
    const checks = [
      result({ severityTier: "error", passed: true }),
      result({ severityTier: "warning", passed: false, inferred: true }),
    ];
    // the inferred warning failure is dropped; only the passing error remains
    expect(computeScore(checks)).toEqual({ score: 100, grade: "A" });
  });

  test("a half-passing error tier yields a mid score", () => {
    const checks = [
      result({ severityTier: "error", passed: true }),
      result({ severityTier: "error", passed: false }),
    ];
    expect(computeScore(checks).score).toBe(50);
  });
});
