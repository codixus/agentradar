import type { CheckResult, SeverityTier } from "./types.ts";

export interface Score {
  score: number;
  grade: string;
}

// The composite score is a tier-weighted pass ratio across every verifiable
// check. The severity tier is the scoring lever: error checks (weight 4) are
// the load-bearing signals every agent-ready site must serve; warning checks
// (weight 2) are established-but-secondary; notice checks (weight 1) are the
// emerging standards (MCP/A2A/UCP/x402/oauth/dns-aid/...). Notice checks carry
// real, low weight rather than being excluded: adopting them is what moves a
// site from a B into an A, but a site is not failed for skipping specs that are
// only weeks old. Inferred checks (MPP, Web Bot Auth) are not verified
// pass/fail signals and are excluded from the ratio entirely.
const TIER_WEIGHT: Record<SeverityTier, number> = {
  error: 4,
  warning: 2,
  notice: 1,
};

// Grade bands, highest first. A>=90 requires the established signals plus broad
// adoption of the emerging ones; C is the floor for a site that serves every
// established signal but no emerging ones (see computeScore's error-tier cap).
const GRADE_BANDS: ReadonlyArray<{ min: number; grade: string }> = [
  { min: 90, grade: "A" },
  { min: 72, grade: "B" },
  { min: 50, grade: "C" },
  { min: 30, grade: "D" },
  { min: 0, grade: "F" },
];

export function computeScore(checks: CheckResult[]): Score {
  const scored = checks.filter((c) => !c.inferred);
  if (scored.length === 0) {
    return { score: 100, grade: gradeFor(100, false) };
  }
  let totalWeight = 0;
  let gotWeight = 0;
  let errorTierFailed = false;
  for (const c of scored) {
    const weight = TIER_WEIGHT[c.severityTier];
    totalWeight += weight;
    if (c.passed) {
      gotWeight += weight;
    } else if (c.severityTier === "error") {
      errorTierFailed = true;
    }
  }
  const score = Math.round((gotWeight / totalWeight) * 100);
  return { score, grade: gradeFor(score, errorTierFailed) };
}

// A failing error-tier check caps the grade at C: a site that cannot serve a
// load-bearing signal (e.g. markdown negotiation) should not read as B or A no
// matter how many emerging signals it also serves. The score number is left
// untouched; only the letter is capped, and only downward (a computed C/D/F is
// never lifted).
function gradeFor(score: number, errorTierFailed: boolean): string {
  const banded = GRADE_BANDS.find((b) => score >= b.min)?.grade ?? "F";
  if (errorTierFailed && (banded === "A" || banded === "B")) {
    return "C";
  }
  return banded;
}
