import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fetchText } from "./fetch-text.ts";
import { fail, pass } from "./util.ts";

// notice tier: research found 97% of llms.txt files get zero AI requests and
// Google states they neither help nor harm ranking. Real, but a minor check.
const meta: CheckMeta = {
  id: "llms-txt",
  title: "llms.txt",
  category: "can-agents-read-you",
  severityTier: "notice",
};

async function run(ctx: CheckContext): Promise<CheckResult> {
  const result = await fetchText(ctx, "/llms.txt");
  if (!result?.ok) {
    return fail(
      meta,
      "could not find /llms.txt",
      "Publish an llms.txt at the site root (see llmstxt.org).",
    );
  }
  if (!/^\s*#/.test(result.body)) {
    return fail(
      meta,
      "llms.txt found but does not start with an H1 title",
      "Start the file with # <title>.",
    );
  }
  return pass(meta, `llms.txt found (${result.body.length} bytes)`);
}

export const llmsTxtCheck: Check = { ...meta, run };
