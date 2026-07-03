import { aiBotRulesCheck } from "./checks/ai-bot-rules.ts";
import { contentSignalsCheck } from "./checks/content-signals.ts";
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

function withTimeout(fetchImpl: typeof fetch, timeoutMs: number): typeof fetch {
  return (async (...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }) as typeof fetch;
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
    score: computeScore(categoryChecks).score,
    checks: categoryChecks,
  }));
}

export async function runScan(
  url: string,
  options: RunScanOptions = {},
): Promise<ScanResult> {
  const baseUrl = new URL(url);
  const fetchImpl = withTimeout(
    options.fetchImpl ?? fetch,
    options.timeoutMs ?? 8000,
  );
  const ctx: CheckContext = { baseUrl, fetchImpl };

  const settled = await Promise.allSettled(
    ALL_CHECKS.map((check) => check.run(ctx)),
  );
  const checks: CheckResult[] = settled.map((outcome, index) => {
    if (outcome.status === "fulfilled") return outcome.value;
    const check = ALL_CHECKS[index];
    return {
      id: check.id,
      title: check.title,
      category: check.category,
      severityTier: check.severityTier,
      passed: false,
      evidence: `check crashed: ${String(outcome.reason)}`,
    };
  });

  const { score, grade } = computeScore(checks);

  return {
    url: baseUrl.href,
    score,
    grade,
    checks,
    categories: groupByCategory(checks),
  };
}
