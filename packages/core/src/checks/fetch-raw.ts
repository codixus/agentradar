import type { CheckContext } from "../types.ts";
import { MAX_REDIRECTS } from "./http.ts";

type FetchContext = Pick<CheckContext, "fetchImpl" | "timeoutMs">;

// Only these status codes, and only with a Location header, are treated as
// redirects to follow. 304 (Not Modified) and any Location-less 3xx are
// returned to the caller as-is.
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Follows redirects manually (redirect: "manual") up to MAX_REDIRECTS, instead
// of letting the runtime auto-follow ~20 with no explicit bound. Uses the
// caller-provided signal so the caller owns the timeout window: fetchRaw bounds
// up to the final response's headers, while fetchText extends the same window
// across its body read. Returns null when the cap is exceeded.
export async function followRedirects(
  fetchImpl: typeof fetch,
  url: string | URL,
  init: RequestInit | undefined,
  signal: AbortSignal,
): Promise<Response | null> {
  let current = new URL(url);
  for (let redirects = 0; ; redirects++) {
    const res = await fetchImpl(current, {
      ...init,
      redirect: "manual",
      signal,
    });
    const location = res.headers.get("location");
    if (!REDIRECT_STATUSES.has(res.status) || !location) return res;
    // We are not returning this redirect response; free its body.
    await res.body?.cancel().catch(() => {});
    if (redirects >= MAX_REDIRECTS) return null;
    current = new URL(location, current);
  }
}

// Shared by checks that need the raw Response (status, headers, method) rather
// than fetchText's parsed-body shape. Owns a timeout that bounds the request up
// to the final response's headers (callers of fetchRaw read headers or a small
// body immediately), plus the manual redirect cap above, so every outbound
// request in packages/core is bounded, not just the ones that read a body.
export async function fetchRaw(
  ctx: FetchContext,
  url: string | URL,
  init?: RequestInit,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
  try {
    return await followRedirects(ctx.fetchImpl, url, init, controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
