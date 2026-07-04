import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fetchText } from "./fetch-text.ts";
import { fail, pass } from "./util.ts";

// warning tier: publishing llms.txt is real, established agent-readiness work
// and earns headline credit, even though research found ~97% of llms.txt files
// get zero AI requests and Google says they neither help nor harm ranking --
// the check measures whether the file was published, not whether bots consume
// it. (Downgrade to "notice" to keep it out of the composite score.)
const meta: CheckMeta = {
  id: "llms-txt",
  title: "llms.txt",
  category: "can-agents-read-you",
  severityTier: "warning",
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
