import type {
  Check,
  CheckContext,
  CheckMeta,
  CheckResult,
  HttpStep,
} from "../types.ts";
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
  goal: "Publish an llms.txt that curates the pages agents should read first.",
  resources: [{ label: "llmstxt.org", url: "https://llmstxt.org" }],
};

const ISSUE = "No valid llms.txt is published at the site root.";

async function run(ctx: CheckContext): Promise<CheckResult> {
  const transcript: HttpStep[] = [];
  const result = await fetchText(ctx, "/llms.txt", undefined, transcript);
  if (!result?.ok) {
    return {
      ...fail(
        meta,
        "could not find /llms.txt",
        "Publish an llms.txt at the site root (see llmstxt.org).",
        ISSUE,
      ),
      transcript,
    };
  }
  if (!/^\s*#/.test(result.body)) {
    return {
      ...fail(
        meta,
        "llms.txt found but does not start with an H1 title",
        "Start the file with # <title>.",
        ISSUE,
      ),
      transcript,
    };
  }
  return {
    ...pass(meta, `llms.txt found (${result.body.length} bytes)`),
    transcript,
  };
}

export const llmsTxtCheck: Check = { ...meta, run };
