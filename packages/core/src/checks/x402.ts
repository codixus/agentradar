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
  id: "x402",
  title: "x402",
  category: "can-agents-trust-you",
  severityTier: "notice",
  goal: "Return an x402 payment challenge so agents can pay for gated resources programmatically.",
  resources: [{ label: "x402", url: "https://github.com/coinbase/x402" }],
};

const ISSUE =
  "No x402 payment challenge is exposed at the site root (the full API surface was not probed).";

// x402 has no well-known discovery path -- it is only detectable by probing
// an actual payment-gated endpoint. A generic scanner only knows the site
// root, so this probes that and is explicit in its evidence that it did not
// scan the site's full API surface (a real limitation, not a false claim of
// completeness).
async function run(ctx: CheckContext): Promise<CheckResult> {
  const transcript: HttpStep[] = [];
  const res = await fetchRaw(ctx, ctx.baseUrl, undefined, transcript);
  if (!res) {
    return {
      ...fail(meta, `could not reach ${ctx.baseUrl.href}`, undefined, ISSUE),
      transcript,
    };
  }
  if (
    res.status === 402 &&
    (res.headers.get("payment-required") || res.headers.get("x-payment"))
  ) {
    return {
      ...pass(meta, "site root responded 402 with an x402 payment challenge"),
      transcript,
    };
  }
  return {
    ...fail(
      meta,
      "no x402 payment challenge found at the site root (only the root was probed, not the full API surface)",
      "If any endpoint is payment-gated for agents, respond 402 with a PAYMENT-REQUIRED header (see the x402 Foundation spec).",
      ISSUE,
    ),
    transcript,
  };
}

export const x402Check: Check = { ...meta, run };
