import type { CheckContext, TextFetchResult } from "../types.ts";

type FetchContext = Pick<CheckContext, "baseUrl" | "fetchImpl" | "timeoutMs">;

// The abort timer stays alive across the full fetch-then-read-body sequence
// (cleared only in `finally`, after `.text()` settles) so a target that sends
// headers immediately but stalls the body is still bounded by timeoutMs.
export async function fetchText(
  ctx: FetchContext,
  path: string,
  init?: RequestInit,
): Promise<TextFetchResult | null> {
  const target = new URL(path, ctx.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
  try {
    const res = await ctx.fetchImpl(target, {
      ...init,
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        contentType: res.headers.get("content-type") ?? "",
        body: "",
      };
    }
    const body = await res.text();
    return {
      ok: true,
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      body,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
