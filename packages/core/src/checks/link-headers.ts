import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fetchRaw } from "./fetch-raw.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "link-headers",
  title: "Link headers",
  category: "can-agents-find-you",
  severityTier: "warning",
};

async function run(ctx: CheckContext): Promise<CheckResult> {
  const res = await fetchRaw(ctx, ctx.baseUrl, { method: "HEAD" });
  if (!res) {
    return fail(meta, `could not reach ${ctx.baseUrl.href}`);
  }
  const linkHeader = res.headers.get("link");
  if (!linkHeader) {
    return fail(
      meta,
      "no Link response header found",
      'Add a Link header, e.g. Link: </llms.txt>; rel="describedby"',
    );
  }
  // Agent-useful rel values: api-catalog (RFC 9727), describedby (the
  // mt-agent-discovery pattern for pointing at llms.txt), and service-desc /
  // service-doc (RFC 8631, commonly used to point at an OpenAPI spec /
  // documentation -- confirmed against a real Cloudflare-published Link
  // header, which uses these two alongside api-catalog).
  const AGENT_USEFUL_RELS = [
    "api-catalog",
    "describedby",
    "service-desc",
    "service-doc",
  ];
  const escaped = AGENT_USEFUL_RELS.map((rel) =>
    rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const relMatch = new RegExp(`rel\\s*=\\s*"?(${escaped.join("|")})"?`, "i");
  if (!relMatch.test(linkHeader)) {
    return fail(
      meta,
      `Link header found but has no recognized rel value: ${linkHeader}`,
    );
  }
  return pass(meta, `Link: ${linkHeader}`);
}

export const linkHeadersCheck: Check = { ...meta, run };
