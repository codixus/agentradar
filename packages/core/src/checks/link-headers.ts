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
  if (
    !/rel\s*=\s*"?api-catalog"?/i.test(linkHeader) &&
    !/rel\s*=\s*"?describedby"?/i.test(linkHeader)
  ) {
    return fail(
      meta,
      `Link header found but has no recognized rel value: ${linkHeader}`,
    );
  }
  return pass(meta, `Link: ${linkHeader}`);
}

export const linkHeadersCheck: Check = { ...meta, run };
