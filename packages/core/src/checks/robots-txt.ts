import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fetchText } from "./fetch-text.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "robots-txt",
  title: "robots.txt",
  category: "can-agents-find-you",
  severityTier: "warning",
};

async function run(ctx: CheckContext): Promise<CheckResult> {
  const result = await fetchText(ctx, "/robots.txt");
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
