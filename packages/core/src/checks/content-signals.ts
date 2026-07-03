import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fetchText } from "./fetch-text.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "content-signals",
  title: "Content Signals",
  category: "can-agents-read-you",
  severityTier: "warning",
};

async function run(ctx: CheckContext): Promise<CheckResult> {
  const result = await fetchText(ctx, "/robots.txt");
  if (!result?.ok) {
    return fail(meta, "no robots.txt found to declare Content-Signal in");
  }
  const line = result.body
    .split(/\r?\n/)
    .find((l) => /^\s*content-signal\s*:/i.test(l));
  if (!line) {
    return fail(
      meta,
      "robots.txt present but has no Content-Signal line",
      "Add a Content-Signal line, e.g. Content-Signal: search=yes, ai-train=yes, ai-input=yes",
    );
  }
  return pass(meta, line.trim());
}

export const contentSignalsCheck: Check = { ...meta, run };
