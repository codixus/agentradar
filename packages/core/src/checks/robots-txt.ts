import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "robots-txt",
  title: "robots.txt",
  category: "can-agents-find-you",
  severityTier: "warning",
};

// robots.txt is fetched once per scan (see scan.ts) and shared via
// ctx.robotsTxt with ai-bot-rules and content-signals, instead of each
// check fetching it independently.
async function run(ctx: CheckContext): Promise<CheckResult> {
  const result = ctx.robotsTxt;
  if (!result) {
    return fail(
      meta,
      "could not reach /robots.txt",
      "Publish a robots.txt at the site root.",
    );
  }
  if (!result.ok) {
    return fail(
      meta,
      `GET /robots.txt returned ${result.status}`,
      "Publish a robots.txt at the site root.",
    );
  }
  if (!/user-agent\s*:/i.test(result.body)) {
    return fail(
      meta,
      "robots.txt found but has no User-agent directive",
      "Add at least one User-agent group.",
    );
  }
  return pass(meta, `robots.txt found (${result.body.length} bytes)`);
}

export const robotsTxtCheck: Check = { ...meta, run };
