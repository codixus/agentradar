import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fetchText } from "./fetch-text.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "sitemap",
  title: "sitemap.xml",
  category: "can-agents-find-you",
  severityTier: "warning",
};

async function run(ctx: CheckContext): Promise<CheckResult> {
  const result = await fetchText(ctx, "/sitemap.xml");
  if (!result?.ok) {
    return fail(
      meta,
      "could not find /sitemap.xml",
      "Publish a sitemap.xml at the site root.",
    );
  }
  if (!/<urlset|<sitemapindex/i.test(result.body)) {
    return fail(
      meta,
      "sitemap.xml found but does not look like a valid sitemap",
      "Ensure the file is valid sitemap XML.",
    );
  }
  return pass(meta, `sitemap.xml found (${result.body.length} bytes)`);
}

export const sitemapCheck: Check = { ...meta, run };
