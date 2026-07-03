import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "markdown-negotiation",
  title: "Markdown negotiation",
  category: "can-agents-read-you",
  severityTier: "error",
};

async function run(ctx: CheckContext): Promise<CheckResult> {
  let res: Response;
  try {
    res = await ctx.fetchImpl(ctx.baseUrl, {
      headers: { accept: "text/markdown, text/html;q=0.8" },
    });
  } catch {
    return fail(meta, `could not reach ${ctx.baseUrl.href}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
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
