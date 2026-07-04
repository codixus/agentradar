import type { CheckContext, HttpStep, TextFetchResult } from "../types.ts";
import { followRedirects } from "./fetch-raw.ts";
import { readCappedText } from "./http.ts";

type FetchContext = Pick<CheckContext, "baseUrl" | "fetchImpl" | "timeoutMs">;

// The abort timer stays alive across the full follow-redirects-then-read-body
// sequence (cleared only in `finally`, after readCappedText settles) so a
// target that sends headers immediately but stalls the body is still bounded by
// timeoutMs. The body itself is size-capped (readCappedText) and redirects are
// capped (followRedirects), so no outbound read is unbounded in bytes or hops.
//
// Pass a `steps` array to collect the request(s) made, for a check's transcript.
export async function fetchText(
  ctx: FetchContext,
  path: string,
  init?: RequestInit,
  steps?: HttpStep[],
): Promise<TextFetchResult | null> {
  const target = new URL(path, ctx.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
  try {
    const res = await followRedirects(
      ctx.fetchImpl,
      target,
      init,
      controller.signal,
      steps,
    );
    if (!res) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, status: res.status, contentType, body: "" };
    }
    const body = await readCappedText(res);
    return { ok: true, status: res.status, contentType, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
