import type { CheckContext } from "../types.ts";

type FetchContext = Pick<CheckContext, "fetchImpl" | "timeoutMs">;

// Shared by checks that need the raw Response (status, headers, method)
// rather than fetchText's parsed-body shape. Owns the same
// fetch-then-settle timeout discipline as fetchText, so every outbound
// request in packages/core is bounded by timeoutMs, not just the ones that
// happen to read a body.
export async function fetchRaw(
  ctx: FetchContext,
  url: string | URL,
  init?: RequestInit,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
  try {
    return await ctx.fetchImpl(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
