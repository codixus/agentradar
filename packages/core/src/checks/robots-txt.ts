import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "robots-txt",
  title: "robots.txt",
  category: "can-agents-find-you",
  severityTier: "warning",
  goal: "Publish a parseable robots.txt at your site root so agents know your crawling rules.",
  resources: [
    { label: "RFC 9309", url: "https://www.rfc-editor.org/rfc/rfc9309" },
  ],
};

const ISSUE = "No usable robots.txt is published at the site root.";

// robots.txt is fetched once per scan (see scan.ts) and shared via
// ctx.robotsTxt with ai-bot-rules and content-signals, instead of each
// check fetching it independently. Those three checks report the same shared
// prefetch steps as their transcript (ctx.robotsTranscript).
async function run(ctx: CheckContext): Promise<CheckResult> {
  const transcript = [...(ctx.robotsTranscript ?? [])];
  const result = ctx.robotsTxt;
  if (!result) {
    return {
      ...fail(
        meta,
        "could not reach /robots.txt",
        "Publish a robots.txt at the site root.",
        ISSUE,
      ),
      transcript,
    };
  }
  if (!result.ok) {
    return {
      ...fail(
        meta,
        `GET /robots.txt returned ${result.status}`,
        "Publish a robots.txt at the site root.",
        ISSUE,
      ),
      transcript,
    };
  }
  if (!/user-agent\s*:/i.test(result.body)) {
    return {
      ...fail(
        meta,
        "robots.txt found but has no User-agent directive",
        "Add at least one User-agent group.",
        ISSUE,
      ),
      transcript,
    };
  }
  return {
    ...pass(meta, `robots.txt found (${result.body.length} bytes)`),
    transcript,
  };
}

export const robotsTxtCheck: Check = { ...meta, run };
