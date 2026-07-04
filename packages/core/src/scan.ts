import { a2aAgentCardCheck } from "./checks/a2a-agent-card.ts";
import { agentSkillsCheck } from "./checks/agent-skills.ts";
import { aiBotRulesCheck } from "./checks/ai-bot-rules.ts";
import { apiCatalogCheck } from "./checks/api-catalog.ts";
import { authMdCheck } from "./checks/auth-md.ts";
import { contentSignalsCheck } from "./checks/content-signals.ts";
import { deepLinkAssociationCheck } from "./checks/deep-link-association.ts";
import { dnsAidCheck } from "./checks/dns-aid.ts";
import { fetchText } from "./checks/fetch-text.ts";
import { linkHeadersCheck } from "./checks/link-headers.ts";
import { llmsTxtCheck } from "./checks/llms-txt.ts";
import { markdownNegotiationCheck } from "./checks/markdown-negotiation.ts";
import { mcpServerCardCheck } from "./checks/mcp-server-card.ts";
import { mppCheck } from "./checks/mpp.ts";
import { oauthDiscoveryCheck } from "./checks/oauth-discovery.ts";
import { oauthProtectedResourceCheck } from "./checks/oauth-protected-resource.ts";
import { robotsTxtCheck } from "./checks/robots-txt.ts";
import { sitemapCheck } from "./checks/sitemap.ts";
import { ucpCheck } from "./checks/ucp.ts";
import { webBotAuthCheck } from "./checks/web-bot-auth.ts";
import { x402Check } from "./checks/x402.ts";
import { computeScore } from "./scoring.ts";
import type {
  CategoryResult,
  Check,
  CheckContext,
  CheckResult,
  ScanResult,
} from "./types.ts";

const ALL_CHECKS: Check[] = [
  // can-agents-find-you
  robotsTxtCheck,
  aiBotRulesCheck,
  sitemapCheck,
  linkHeadersCheck,
  dnsAidCheck,
  // can-agents-read-you
  llmsTxtCheck,
  markdownNegotiationCheck,
  contentSignalsCheck,
  // can-agents-reach-your-app
  deepLinkAssociationCheck,
  // can-agents-trust-you
  apiCatalogCheck,
  oauthDiscoveryCheck,
  oauthProtectedResourceCheck,
  authMdCheck,
  mcpServerCardCheck,
  a2aAgentCardCheck,
  agentSkillsCheck,
  ucpCheck,
  x402Check,
  webBotAuthCheck,
  mppCheck,
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
//
// Inferred checks (e.g. MPP, which has no discovery mechanism and always
// reports "cannot verify") are excluded from the ratio: they are not
// verified pass/fail signals and should not permanently cap a category's
// score even when the site is otherwise perfectly configured.
export function categoryScore(checks: CheckResult[]): number {
  const scorable = checks.filter((c) => !c.inferred);
  if (scorable.length === 0) return 100;
  const passing = scorable.filter((c) => c.passed).length;
  return Math.round((passing / scorable.length) * 100);
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
// caller picks their own scan target, the same trust model as curl. Every
// outbound request is bounded by timeoutMs, a redirect cap, and a response
// body-size cap (see checks/http.ts and fetch-raw.ts) as defense-in-depth,
// and unscannable schemes are rejected here. A caller that accepts a URL from
// someone it does not control (e.g. a future web-hosted scan endpoint) is
// still responsible for its own SSRF hardening -- private/internal-IP and
// DNS-rebinding filtering -- before calling runScan.
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
