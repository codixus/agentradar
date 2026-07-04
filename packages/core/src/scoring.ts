import type { CheckResult, SeverityTier } from "./types.ts";

export interface Score {
  score: number;
  grade: string;
}

// The composite score is a tier-weighted pass ratio, deliberately excluding
// notice-tier checks entirely. The severity tier IS the scoring lever: error
// checks (weight 2) are the load-bearing signals, warning checks (weight 1)
// are established-but-secondary. Notice-tier checks are specs only weeks old
// (MCP/A2A/UCP/x402/oauth/dns-aid/...); penalizing every site for not adopting
// a five-week-old draft would misrepresent "readiness", so they show in the
// per-category breakdown but never move the headline grade. Inferred checks
// (MPP, Web Bot Auth) are not verified pass/fail signals and are excluded too.
const TIER_WEIGHT: Record<SeverityTier, number> = {
  error: 2,
  warning: 1,
  notice: 0,
};

export function computeScore(checks: CheckResult[]): Score {
  const scored = checks.filter(
    (c) => !c.inferred && TIER_WEIGHT[c.severityTier] > 0,
  );
  if (scored.length === 0) {
    return { score: 100, grade: gradeFor(100) };
  }
  let totalWeight = 0;
  let gotWeight = 0;
  for (const c of scored) {
    const weight = TIER_WEIGHT[c.severityTier];
    totalWeight += weight;
    if (c.passed) gotWeight += weight;
  }
  const score = Math.round((gotWeight / totalWeight) * 100);
  return { score, grade: gradeFor(score) };
}

function gradeFor(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}
