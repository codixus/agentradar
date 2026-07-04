import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fetchText } from "./fetch-text.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "deep-link-association",
  title: "App deep-link association",
  category: "can-agents-reach-your-app",
  severityTier: "notice",
};

function looksLikeAppleAppSiteAssociation(body: string): boolean {
  try {
    const json = JSON.parse(body);
    return typeof json === "object" && json !== null && "applinks" in json;
  } catch {
    return false;
  }
}

function looksLikeAssetLinks(body: string): boolean {
  try {
    const json = JSON.parse(body);
    return (
      Array.isArray(json) &&
      json.some(
        (entry) => entry && typeof entry === "object" && "relation" in entry,
      )
    );
  } catch {
    return false;
  }
}

// Checks whether AI shopping/browsing agents can deep-link from a web
// result straight into in-app content -- the product-level differentiator
// from every generic site checker in the competitive landscape (research
// notes section 3).
async function run(ctx: CheckContext): Promise<CheckResult> {
  const [appleResult, androidResult] = await Promise.all([
    fetchText(ctx, "/.well-known/apple-app-site-association"),
    fetchText(ctx, "/.well-known/assetlinks.json"),
  ]);

  const appleValid =
    !!appleResult?.ok && looksLikeAppleAppSiteAssociation(appleResult.body);
  const androidValid =
    !!androidResult?.ok && looksLikeAssetLinks(androidResult.body);

  if (!appleValid && !androidValid) {
    return fail(
      meta,
      "no valid apple-app-site-association or assetlinks.json found",
      "Publish /.well-known/apple-app-site-association (Universal Links) and/or /.well-known/assetlinks.json (Android App Links) if you have a companion app.",
    );
  }

  const found: string[] = [];
  if (appleValid) found.push("apple-app-site-association");
  if (androidValid) found.push("assetlinks.json");
  return pass(meta, `found: ${found.join(", ")}`);
}

export const deepLinkAssociationCheck: Check = { ...meta, run };
