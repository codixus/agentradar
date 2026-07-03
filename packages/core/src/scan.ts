import { aiBotRulesCheck } from "./checks/ai-bot-rules.ts";
import { contentSignalsCheck } from "./checks/content-signals.ts";
import { fetchText } from "./checks/fetch-text.ts";
import { llmsTxtCheck } from "./checks/llms-txt.ts";
import { markdownNegotiationCheck } from "./checks/markdown-negotiation.ts";
import { robotsTxtCheck } from "./checks/robots-txt.ts";
import { sitemapCheck } from "./checks/sitemap.ts";
import { computeScore } from "./scoring.ts";
import type {
  CategoryResult,
  Check,
  CheckContext,
  CheckResult,
  ScanResult,
} from "./types.ts";

const ALL_CHECKS: Check[] = [
  robotsTxtCheck,
  aiBotRulesCheck,
  sitemapCheck,
  llmsTxtCheck,
  markdownNegotiationCheck,
  contentSignalsCheck,
];

export interface RunScanOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// A category score is the plain pass ratio of every check in that category,
// deliberately not the error-tier-only rule used for the composite score
// (computeScore in scoring.ts): a category made only of warning/notice
// checks would otherwise always read 100 even when every check in it fails,
// which is misleading in a per-category report.
function categoryScore(checks: CheckResult[]): number {
  if (checks.length === 0) return 100;
  const passing = checks.filter((c) => c.passed).length;
  return Math.round((passing / checks.length) * 100);
}

function groupByCategory(checks: CheckResult[]): CategoryResult[] {
  const byCategory = new Map<string, CheckResult[]>();
  for (const check of checks) {
    const list = byCategory.get(check.category) ?? [];
    list.push(check);
    byCategory.set(check.category, list);
  }
  return [...byCategory.entries()].map(([category, categoryChecks]) => ({
    category,
    score: categoryScore(categoryChecks),
    checks: categoryChecks,
  }));
}

export async function runChecks(
  checks: Check[],
  ctx: CheckContext,
): Promise<CheckResult[]> {
  const settled = await Promise.allSettled(
    checks.map((check) => check.run(ctx)),
  );
  return settled.map((outcome, index) => {
    if (outcome.status === "fulfilled") return outcome.value;
    const check = checks[index];
    return {
      id: check.id,
      title: check.title,
      category: check.category,
      severityTier: check.severityTier,
      passed: false,
      evidence: `check crashed: ${String(outcome.reason)}`,
    };
  });
}

// packages/core trusts its input: it is the engine behind a CLI where the
// caller picks their own scan target, the same trust model as curl. A
// caller that accepts a URL from someone else it does not control (e.g. a
// future web-hosted scan endpoint) is responsible for its own SSRF
// hardening -- private/internal-IP filtering, redirect caps, response-size
// caps -- before calling runScan; this function only rejects unscannable
// schemes and bounds each request by timeoutMs.
export async function runScan(
  url: string,
  options: RunScanOptions = {},
): Promise<ScanResult> {
  const baseUrl = new URL(url);
  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new Error(
      `unsupported URL scheme "${baseUrl.protocol}" - only http and https can be scanned`,
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  const robotsTxt = await fetchText(
    { baseUrl, fetchImpl, timeoutMs },
    "/robots.txt",
  );
  const ctx: CheckContext = { baseUrl, fetchImpl, timeoutMs, robotsTxt };

  const checks = await runChecks(ALL_CHECKS, ctx);
  const { score, grade } = computeScore(checks);

  return {
    url: baseUrl.href,
    score,
    grade,
    checks,
    categories: groupByCategory(checks),
  };
}
