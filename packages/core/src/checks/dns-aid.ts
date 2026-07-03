import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "dns-aid",
  title: "DNS for AI Discovery (DNS-AID)",
  category: "can-agents-find-you",
  severityTier: "notice",
};

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

interface DohResponse {
  Answer?: Array<{ data?: string }>;
}

// DNS-AID (draft-mozleywilliams-dnsop-dnsaid) publishes an SVCB record at
// _index._agents.<domain>. Node/Bun's dns module does not support querying
// the SVCB/HTTPS record type (only A/AAAA/ANY/CAA/CNAME/MX/NS/PTR/SOA/SRV/
// TXT are accepted), so this queries a DNS-over-HTTPS resolver instead --
// still a single passive request, and it goes through ctx.fetchImpl like
// every other check instead of needing a separate DNS resolver seam.
async function run(ctx: CheckContext): Promise<CheckResult> {
  const hostname = `_index._agents.${ctx.baseUrl.hostname}`;
  const query = `${DOH_ENDPOINT}?name=${encodeURIComponent(hostname)}&type=SVCB`;
  let res: Response;
  try {
    res = await ctx.fetchImpl(query, {
      headers: { accept: "application/dns-json" },
    });
  } catch {
    return fail(meta, "could not query a DNS-over-HTTPS resolver");
  }
  if (!res.ok) {
    return fail(meta, `DNS-over-HTTPS query returned ${res.status}`);
  }
  const data = (await res.json().catch(() => null)) as DohResponse | null;
  const answers = data?.Answer;
  if (!Array.isArray(answers) || answers.length === 0) {
    return fail(
      meta,
      `no SVCB record found at ${hostname}`,
      "Publish an SVCB record for AI agent discovery (draft-mozleywilliams-dnsop-dnsaid, ~5 weeks old at research time, expect near-zero adoption).",
    );
  }
  return pass(
    meta,
    `SVCB record found at ${hostname} (${answers.length} answer(s))`,
  );
}

export const dnsAidCheck: Check = { ...meta, run };
