import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "content-signals",
  title: "Content Signals",
  category: "can-agents-read-you",
  severityTier: "warning",
  goal: "Declare how AI may use your content with a Content-Signal line in robots.txt.",
  resources: [{ label: "Content Signals", url: "https://contentsignals.org" }],
};

const ISSUE = "robots.txt declares no Content-Signal preferences.";

// robots.txt is prefetched once per scan and shared via ctx.robotsTxt (see
// scan.ts); its prefetch steps are shared as this check's transcript.
async function run(ctx: CheckContext): Promise<CheckResult> {
  const transcript = ctx.robotsTranscript ?? [];
  const result = ctx.robotsTxt;
  if (!result?.ok) {
    return {
      ...fail(
        meta,
        "no robots.txt found to declare Content-Signal in",
        undefined,
        ISSUE,
      ),
      transcript,
    };
  }
  const line = result.body
    .split(/\r?\n/)
    .find((l) => /^\s*content-signal\s*:/i.test(l));
  if (!line) {
    return {
      ...fail(
        meta,
        "robots.txt present but has no Content-Signal line",
        "Add a Content-Signal line, e.g. Content-Signal: search=yes, ai-train=yes, ai-input=yes",
        ISSUE,
      ),
      transcript,
    };
  }
  return { ...pass(meta, line.trim()), transcript };
}

export const contentSignalsCheck: Check = { ...meta, run };
