import type { CheckContext } from "../types.ts";

export interface TextFetchResult {
  ok: boolean;
  status: number;
  contentType: string;
  body: string;
}

// Fetches a path as text, normalizing both HTTP-level failures (4xx/5xx) and
// network-level failures (unreachable host, timeout) into the same shape, so
// every check can handle "could not get a usable body" one way.
export async function fetchText(
  ctx: CheckContext,
  path: string,
  init?: RequestInit,
): Promise<TextFetchResult | null> {
  const target = new URL(path, ctx.baseUrl);
  let res: Response;
  try {
    res = await ctx.fetchImpl(target, init);
  } catch {
    return null;
  }
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
}
