import type {
  Check,
  CheckContext,
  CheckMeta,
  CheckResult,
  HttpStep,
} from "../types.ts";
import { fetchText } from "./fetch-text.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "sitemap",
  title: "sitemap.xml",
  category: "can-agents-find-you",
  severityTier: "warning",
  goal: "Publish a sitemap.xml so agents can enumerate every page worth reading.",
  resources: [
    {
      label: "Sitemaps protocol",
      url: "https://www.sitemaps.org/protocol.html",
    },
  ],
};

const ISSUE = "No valid sitemap.xml is published at the site root.";

async function run(ctx: CheckContext): Promise<CheckResult> {
  const transcript: HttpStep[] = [];
  const result = await fetchText(ctx, "/sitemap.xml", undefined, transcript);
  if (!result?.ok) {
    return {
      ...fail(
        meta,
        "could not find /sitemap.xml",
        "Publish a sitemap.xml at the site root.",
        ISSUE,
      ),
      transcript,
    };
  }
  if (!/<urlset|<sitemapindex/i.test(result.body)) {
    return {
      ...fail(
        meta,
        "sitemap.xml found but does not look like a valid sitemap",
        "Ensure the file is valid sitemap XML.",
        ISSUE,
      ),
      transcript,
    };
  }
  return {
    ...pass(meta, `sitemap.xml found (${result.body.length} bytes)`),
    transcript,
  };
}

export const sitemapCheck: Check = { ...meta, run };
