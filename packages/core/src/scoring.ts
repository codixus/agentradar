import type { CheckResult } from "./types.ts";

export interface Score {
  score: number;
  grade: string;
}

// Only error-tier checks affect the score. Several checks in this space are
// specs only weeks old (see research notes); penalizing every site equally
// for not adopting a five-week-old draft would misrepresent "readiness".
export function computeScore(checks: CheckResult[]): Score {
  const errorChecks = checks.filter((c) => c.severityTier === "error");
  if (errorChecks.length === 0) {
    return { score: 100, grade: gradeFor(100) };
  }
  const passing = errorChecks.filter((c) => c.passed).length;
  const score = Math.round((passing / errorChecks.length) * 100);
  return { score, grade: gradeFor(score) };
}

function gradeFor(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}
