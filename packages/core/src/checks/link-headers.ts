import type {
  Check,
  CheckContext,
  CheckMeta,
  CheckResult,
  HttpStep,
} from "../types.ts";
import { fetchRaw } from "./fetch-raw.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "link-headers",
  title: "Link headers",
  category: "can-agents-find-you",
  severityTier: "warning",
  goal: "Point agents at machine-readable resources with a Link response header.",
  resources: [
    { label: "RFC 8288", url: "https://www.rfc-editor.org/rfc/rfc8288" },
  ],
};

const ISSUE = "No agent-usable Link response header is served.";

async function run(ctx: CheckContext): Promise<CheckResult> {
  const transcript: HttpStep[] = [];
  const res = await fetchRaw(ctx, ctx.baseUrl, { method: "HEAD" }, transcript);
  if (!res) {
    return {
      ...fail(meta, `could not reach ${ctx.baseUrl.href}`, undefined, ISSUE),
      transcript,
    };
  }
  const linkHeader = res.headers.get("link");
  if (!linkHeader) {
    return {
      ...fail(
        meta,
        "no Link response header found",
        'Add a Link header, e.g. Link: </llms.txt>; rel="describedby"',
        ISSUE,
      ),
      transcript,
    };
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
    return {
      ...fail(
        meta,
        `Link header found but has no recognized rel value: ${linkHeader}`,
        undefined,
        ISSUE,
      ),
      transcript,
    };
  }
  return { ...pass(meta, `Link: ${linkHeader}`), transcript };
}

export const linkHeadersCheck: Check = { ...meta, run };
