import type { CheckMeta, CheckResult } from "../types.ts";

export function pass(meta: CheckMeta, evidence: string): CheckResult {
  return {
    id: meta.id,
    title: meta.title,
    category: meta.category,
    severityTier: meta.severityTier,
    passed: true,
    evidence,
  };
}

export function fail(
  meta: CheckMeta,
  evidence: string,
  fixHint?: string,
): CheckResult {
  return {
    id: meta.id,
    title: meta.title,
    category: meta.category,
    severityTier: meta.severityTier,
    passed: false,
    evidence,
    fixHint,
  };
}
