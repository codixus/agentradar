export type SeverityTier = "error" | "warning" | "notice";

export interface TextFetchResult {
  ok: boolean;
  status: number;
  contentType: string;
  body: string;
}

export interface CheckContext {
  baseUrl: URL;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  robotsTxt: TextFetchResult | null;
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
}

export interface CheckMeta {
  id: string;
  title: string;
  category: string;
  severityTier: SeverityTier;
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
