import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fail } from "./util.ts";

const meta: CheckMeta = {
  id: "mpp",
  title: "Machine Payments Protocol",
  category: "can-agents-trust-you",
  severityTier: "notice",
};

// No public discovery header, path, or signal exists for MPP as of the
// research this scanner is based on (mpp.dev's public docs describe only a
// server-side Stripe/Tempo integration, nothing a passive scanner can
// probe). Rather than fabricate a heuristic that would produce misleading
// pass/fail results, this check always reports the same honest "cannot
// verify" result and is tagged inferred so it never reads as a real
// pass/fail signal about the scanned site.
async function run(_ctx: CheckContext): Promise<CheckResult> {
  return {
    ...fail(
      meta,
      "MPP has no publicly documented discovery mechanism; support cannot be verified passively (see mpp.dev)",
    ),
    inferred: true,
  };
}

export const mppCheck: Check = { ...meta, run };
