import type { CheckContext, HttpStep } from "../types.ts";
import { MAX_REDIRECTS, OUTBOUND_USER_AGENT } from "./http.ts";

type FetchContext = Pick<CheckContext, "fetchImpl" | "timeoutMs">;

// Only these status codes, and only with a Location header, are treated as
// redirects to follow. 304 (Not Modified) and any Location-less 3xx are
// returned to the caller as-is.
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function stepDetail(res: Response): string | undefined {
  const contentType = res.headers.get("content-type");
  return contentType ? `content-type: ${contentType}` : undefined;
}

// Follows redirects manually (redirect: "manual") up to MAX_REDIRECTS, instead
// of letting the runtime auto-follow ~20 with no explicit bound. Uses the
// caller-provided signal so the caller owns the timeout window: fetchRaw bounds
// up to the final response's headers, while fetchText extends the same window
// across its body read. Returns null when the cap is exceeded.
//
// When a `steps` collector is passed, every hop is appended to it for the audit
// trail: each redirect as its own step (with the resolved target in `detail`),
// the final response as a step carrying its content-type, and a network error
// or timeout as a step with status null.
export async function followRedirects(
  fetchImpl: typeof fetch,
  url: string | URL,
  init: RequestInit | undefined,
  signal: AbortSignal,
  steps?: HttpStep[],
): Promise<Response | null> {
  let current = new URL(url);
  const method = (init?.method ?? "GET").toUpperCase();
  // Identify every probe unless the caller deliberately overrides the UA.
  const headers = new Headers(init?.headers);
  if (!headers.has("user-agent")) {
    headers.set("user-agent", OUTBOUND_USER_AGENT);
  }
  for (let redirects = 0; ; redirects++) {
    let res: Response;
    try {
      res = await fetchImpl(current, {
        ...init,
        headers,
        redirect: "manual",
        signal,
      });
    } catch (err) {
      steps?.push({
        method,
        url: current.href,
        status: null,
        detail:
          err instanceof Error && err.name === "AbortError"
            ? "request aborted (timeout)"
            : "network error",
      });
      throw err;
    }
    const location = res.headers.get("location");
    if (!REDIRECT_STATUSES.has(res.status) || !location) {
      steps?.push({
        method,
        url: current.href,
        status: res.status,
        detail: stepDetail(res),
      });
      return res;
    }
    const next = new URL(location, current);
    steps?.push({
      method,
      url: current.href,
      status: res.status,
      detail: `redirect -> ${next.href}`,
    });
    // We are not returning this redirect response; free its body.
    await res.body?.cancel().catch(() => {});
    if (redirects >= MAX_REDIRECTS) return null;
    current = next;
  }
}

// Shared by checks that need the raw Response (status, headers, method) rather
// than fetchText's parsed-body shape. Owns a timeout that bounds the request up
// to the final response's headers (callers of fetchRaw read headers or a small
// body immediately), plus the manual redirect cap above, so every outbound
// request in packages/core is bounded, not just the ones that read a body.
//
// Pass a `steps` array to collect the request(s) made, for a check's transcript.
export async function fetchRaw(
  ctx: FetchContext,
  url: string | URL,
  init?: RequestInit,
  steps?: HttpStep[],
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
  try {
    return await followRedirects(
      ctx.fetchImpl,
      url,
      init,
      controller.signal,
      steps,
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
