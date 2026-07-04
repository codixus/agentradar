import type {
  Check,
  CheckContext,
  CheckMeta,
  CheckResult,
  HttpStep,
} from "../types.ts";
import { fetchRaw } from "./fetch-raw.ts";
import { readCappedText } from "./http.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "dns-aid",
  title: "DNS for AI Discovery (DNS-AID)",
  category: "can-agents-find-you",
  severityTier: "notice",
  goal: "Advertise an agent-discovery SVCB record in DNS so agents can find your entrypoints.",
  resources: [
    {
      label: "draft-mozleywilliams-dnsop-dnsaid",
      url: "https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/",
    },
  ],
};

const ISSUE = "No DNS-AID SVCB discovery record is published.";

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

interface DohResponse {
  Status?: number;
  Answer?: Array<{ data?: string }>;
}

// DNS-AID (draft-mozleywilliams-dnsop-dnsaid) publishes an SVCB record at
// _index._agents.<domain>. Node/Bun's dns module does not support querying
// the SVCB/HTTPS record type (only A/AAAA/ANY/CAA/CNAME/MX/NS/PTR/SOA/SRV/
// TXT are accepted), so this queries a DNS-over-HTTPS resolver instead --
// still a single passive request, via fetchRaw so it is timeout-bounded
// like every other outbound request in this package.
async function run(ctx: CheckContext): Promise<CheckResult> {
  const hostname = `_index._agents.${ctx.baseUrl.hostname}`;
  const query = `${DOH_ENDPOINT}?name=${encodeURIComponent(hostname)}&type=SVCB`;
  const transcript: HttpStep[] = [];
  const res = await fetchRaw(
    ctx,
    query,
    { headers: { accept: "application/dns-json" } },
    transcript,
  );
  // The DoH probe is an honest GET to cloudflare-dns.com; annotate its step(s)
  // with the DNS question actually asked so the transcript reads meaningfully.
  // Error steps (status null) keep their network-error detail untouched.
  for (const step of transcript) {
    if (step.status !== null) {
      step.detail = `SVCB query for ${hostname}`;
    }
  }
  if (!res) {
    return {
      ...fail(
        meta,
        "could not query a DNS-over-HTTPS resolver",
        undefined,
        ISSUE,
      ),
      transcript,
    };
  }
  if (!res.ok) {
    return {
      ...fail(
        meta,
        `DNS-over-HTTPS query returned ${res.status}`,
        undefined,
        ISSUE,
      ),
      transcript,
    };
  }
  let data: DohResponse | null;
  try {
    data = JSON.parse(await readCappedText(res)) as DohResponse;
  } catch {
    data = null;
  }
  if (data === null) {
    return {
      ...fail(
        meta,
        "DNS-over-HTTPS query returned an unparseable response",
        undefined,
        ISSUE,
      ),
      transcript,
    };
  }
  // DNS RCODEs: 0 = NOERROR, 3 = NXDOMAIN -- both mean "no SVCB record here"
  // for this check's purposes (NXDOMAIN just means the name doesn't exist at
  // all, which is the common case for a brand-new discovery convention).
  // Anything else (SERVFAIL, REFUSED, ...) is a genuine resolver error, not
  // an answer about the target's DNS-AID support.
  const status = data.Status ?? 0;
  if (status !== 0 && status !== 3) {
    return {
      ...fail(
        meta,
        `DNS-over-HTTPS resolver returned an error (Status ${status})`,
        undefined,
        ISSUE,
      ),
      transcript,
    };
  }
  const answers = data.Answer;
  if (!Array.isArray(answers) || answers.length === 0) {
    return {
      ...fail(
        meta,
        `no SVCB record found at ${hostname}`,
        "Publish an SVCB record for AI agent discovery (draft-mozleywilliams-dnsop-dnsaid, ~5 weeks old at research time, expect near-zero adoption).",
        ISSUE,
      ),
      transcript,
    };
  }
  return {
    ...pass(
      meta,
      `SVCB record found at ${hostname} (${answers.length} answer(s))`,
    ),
    transcript,
  };
}

export const dnsAidCheck: Check = { ...meta, run };
