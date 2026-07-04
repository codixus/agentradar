import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fetchRaw } from "./fetch-raw.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "markdown-negotiation",
  title: "Markdown negotiation",
  category: "can-agents-read-you",
  severityTier: "error",
};

async function run(ctx: CheckContext): Promise<CheckResult> {
  const res = await fetchRaw(ctx, ctx.baseUrl, {
    headers: { accept: "text/markdown, text/html;q=0.8" },
  });
  if (!res) {
    return fail(meta, `could not reach ${ctx.baseUrl.href}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  // This check only needs the content-type header, not the body.
  await res.body?.cancel().catch(() => {});
  if (contentType.toLowerCase().startsWith("text/markdown")) {
    return pass(meta, `responded with ${contentType}`);
  }
  return fail(
    meta,
    `responded with "${contentType || "no content-type"}" instead of text/markdown`,
    "Serve text/markdown when the request's Accept header prefers it over text/html.",
  );
}

export const markdownNegotiationCheck: Check = { ...meta, run };
