import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "x402",
  title: "x402",
  category: "can-agents-trust-you",
  severityTier: "notice",
};

// x402 has no well-known discovery path -- it is only detectable by probing
// an actual payment-gated endpoint. A generic scanner only knows the site
// root, so this probes that and is explicit in its evidence that it did not
// scan the site's full API surface (a real limitation, not a false claim of
// completeness).
async function run(ctx: CheckContext): Promise<CheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
  let res: Response;
  try {
    res = await ctx.fetchImpl(ctx.baseUrl, { signal: controller.signal });
  } catch {
    return fail(meta, `could not reach ${ctx.baseUrl.href}`);
  } finally {
    clearTimeout(timer);
  }
  if (
    res.status === 402 &&
    (res.headers.get("payment-required") || res.headers.get("x-payment"))
  ) {
    return pass(meta, "site root responded 402 with an x402 payment challenge");
  }
  return fail(
    meta,
    "no x402 payment challenge found at the site root (only the root was probed, not the full API surface)",
    "If any endpoint is payment-gated for agents, respond 402 with a PAYMENT-REQUIRED header (see the x402 Foundation spec).",
  );
}

export const x402Check: Check = { ...meta, run };
