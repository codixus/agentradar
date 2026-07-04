export type SeverityTier = "error" | "warning" | "notice";

export interface TextFetchResult {
  ok: boolean;
  status: number;
  contentType: string;
  body: string;
}

// One outbound request made while running a check, recorded for the audit
// trail. A redirect chain shows up as several steps; a network error or timeout
// shows up as a step with status null.
export interface HttpStep {
  method: string; // "GET" | "HEAD" | "DNS" ...
  url: string;
  status: number | null; // null = network error / timeout
  detail?: string; // one line, e.g. "content-type: text/html" or "redirect -> https://..."
}

// An authoritative reference (RFC, spec site) for the standard a check probes.
export interface CheckResource {
  label: string;
  url: string;
}

export interface CheckContext {
  baseUrl: URL;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  robotsTxt: TextFetchResult | null;
  // Steps recorded while prefetching /robots.txt once per scan (see scan.ts),
  // shared by the checks that read ctx.robotsTxt so they can report a transcript
  // without refetching.
  robotsTranscript?: HttpStep[];
}

export interface CheckResult {
  id: string;
  title: string;
  category: string;
  severityTier: SeverityTier;
  passed: boolean;
  evidence: string;
  fixHint?: string;
  inferred?: boolean;
  // Additive audit-trail fields (evidence stays the one-line summary):
  goal?: string; // what good looks like, copied from the check meta
  issue?: string; // one line on what is missing, set on a non-inferred failure
  resources?: CheckResource[]; // authoritative references, copied from the meta
  transcript?: HttpStep[]; // the outbound requests this check made
}

export interface CheckMeta {
  id: string;
  title: string;
  category: string;
  severityTier: SeverityTier;
  goal: string;
  resources?: CheckResource[];
}

export interface Check extends CheckMeta {
  run(ctx: CheckContext): Promise<CheckResult>;
}

export interface CategoryResult {
  category: string;
  score: number;
  checks: CheckResult[];
}

export interface ScanResult {
  url: string;
  score: number;
  grade: string;
  checks: CheckResult[];
  categories: CategoryResult[];
}
