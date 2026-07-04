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

// Builds `total` notice-tier checks with the first `passing` of them passing.
// Notice weight is 1, so a run of exactly 100 notice checks makes the composite
// score equal the pass count, which is convenient for pinning band boundaries.
function noticeMix(total: number, passing: number): CheckResult[] {
  return Array.from({ length: total }, (_, i) =>
    result({ severityTier: "notice", passed: i < passing }),
  );
}

describe("computeScore", () => {
  test("no checks at all yields a perfect score (nothing to fail)", () => {
    expect(computeScore([])).toEqual({ score: 100, grade: "A" });
  });

  test("only inferred checks present yields a perfect score (nothing verifiable to score)", () => {
    const checks = [
      result({ severityTier: "error", passed: false, inferred: true }),
      result({ severityTier: "notice", passed: false, inferred: true }),
    ];
    expect(computeScore(checks)).toEqual({ score: 100, grade: "A" });
  });

  test("all scored checks passing yields a perfect score", () => {
    const checks = [
      result({ severityTier: "error", passed: true }),
      result({ severityTier: "warning", passed: true }),
      result({ severityTier: "notice", passed: true }),
    ];
    expect(computeScore(checks)).toEqual({ score: 100, grade: "A" });
  });

  test("all scored checks failing yields the lowest grade", () => {
    const checks = [
      result({ severityTier: "error", passed: false }),
      result({ severityTier: "warning", passed: false }),
      result({ severityTier: "notice", passed: false }),
    ];
    const { score, grade } = computeScore(checks);
    expect(score).toBe(0);
    expect(grade).toBe("F");
  });

  // R1: notice-tier checks now carry weight 1 and move the score. Adopting
  // emerging standards is what lifts a site from B into A.
  test("R1: notice-tier checks now move the score (they are no longer excluded)", () => {
    const withNoticeFail = [
      result({ severityTier: "error", passed: true }),
      result({ severityTier: "notice", passed: false }),
    ];
    // error 4 (passing) of 5 total -> 80, not the old 100
    expect(computeScore(withNoticeFail).score).toBe(80);
  });

  // R1: TIER_WEIGHT is error 4, warning 2, notice 1.
  test("R1: tiers are weighted error 4, warning 2, notice 1", () => {
    const errorPasses = [
      result({ severityTier: "error", passed: true }),
      result({ severityTier: "warning", passed: false }),
      result({ severityTier: "notice", passed: false }),
    ];
    // 4 of (4+2+1)=7 -> 57
    expect(computeScore(errorPasses).score).toBe(57);

    const warningPasses = [
      result({ severityTier: "error", passed: false }),
      result({ severityTier: "warning", passed: true }),
      result({ severityTier: "notice", passed: false }),
    ];
    // 2 of 7 -> 29: the same single pass weighs less at the warning tier
    expect(computeScore(warningPasses).score).toBe(29);
  });

  // R1: inferred checks (Web Bot Auth, MPP) are excluded from the ratio and
  // must never trigger the error-tier cap either.
  test("R1: inferred checks are excluded and never trigger the error-tier cap", () => {
    const checks = [
      result({ severityTier: "error", passed: true }),
      result({ severityTier: "error", passed: false, inferred: true }),
      result({ severityTier: "warning", passed: true }),
    ];
    // the inferred error failure is dropped: only the passing error+warning
    // remain -> 100, and no cap fires because the failure was inferred
    expect(computeScore(checks)).toEqual({ score: 100, grade: "A" });
  });

  // R2: grade bands. Pinned against 100-check notice runs so the score equals
  // the pass count exactly.
  test("R2: grade bands are A>=90, B>=72, C>=50, D>=30, else F", () => {
    expect(computeScore(noticeMix(10, 9)).grade).toBe("A"); // 90
    expect(computeScore(noticeMix(100, 89)).grade).toBe("B"); // 89
    expect(computeScore(noticeMix(100, 72)).grade).toBe("B"); // 72
    expect(computeScore(noticeMix(100, 71)).grade).toBe("C"); // 71
    expect(computeScore(noticeMix(100, 50)).grade).toBe("C"); // 50
    expect(computeScore(noticeMix(100, 49)).grade).toBe("D"); // 49
    expect(computeScore(noticeMix(100, 30)).grade).toBe("D"); // 30
    expect(computeScore(noticeMix(100, 29)).grade).toBe("F"); // 29
  });

  // R2: a site with every established (error + warning) signal but zero emerging
  // (notice) ones lands at C, not A. This is the Cloudflare calibration point:
  // 1 error + 6 warnings passing (weight 16) against 11 failing notices,
  // 16 of 27 total weight -> 59.
  test("R2: all established signals but zero emerging ones lands at C, not A", () => {
    const checks = [
      result({ severityTier: "error", passed: true }),
      ...Array.from({ length: 6 }, () =>
        result({ severityTier: "warning", passed: true }),
      ),
      ...Array.from({ length: 11 }, () =>
        result({ severityTier: "notice", passed: false }),
      ),
    ];
    const { score, grade } = computeScore(checks);
    expect(score).toBe(59);
    expect(grade).toBe("C");
  });

  // R2: any non-inferred error-tier failure caps the grade at C, even when the
  // weighted score would otherwise be a B or an A.
  test("R2: a failing error-tier check caps an A-band score down to C", () => {
    const checks = [
      result({ severityTier: "error", passed: false }),
      ...Array.from({ length: 18 }, () =>
        result({ severityTier: "warning", passed: true }),
      ),
    ];
    // 36 of 40 weight -> 90, an A by band, capped to C by the error failure
    expect(computeScore(checks)).toEqual({ score: 90, grade: "C" });
  });

  test("R2: a failing error-tier check caps a B-band score down to C", () => {
    const checks = [
      result({ severityTier: "error", passed: false }),
      ...Array.from({ length: 30 }, () =>
        result({ severityTier: "notice", passed: true }),
      ),
    ];
    // 30 of 34 weight -> 88, a B by band, capped to C by the error failure
    expect(computeScore(checks)).toEqual({ score: 88, grade: "C" });
  });

  test("R2: the error-tier cap never raises an already-low grade", () => {
    const checks = [
      result({ severityTier: "error", passed: false }),
      result({ severityTier: "warning", passed: false }),
      result({ severityTier: "notice", passed: false }),
    ];
    // 0 of 7 -> F, and the cap must not turn F into C
    const { score, grade } = computeScore(checks);
    expect(score).toBe(0);
    expect(grade).toBe("F");
  });

  test("a half-passing error tier yields a mid score", () => {
    const checks = [
      result({ severityTier: "error", passed: true }),
      result({ severityTier: "error", passed: false }),
    ];
    // 4 of 8 -> 50, but one error failed so the grade is capped at C anyway
    const { score, grade } = computeScore(checks);
    expect(score).toBe(50);
    expect(grade).toBe("C");
  });
});
