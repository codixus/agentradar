import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fetchText } from "./fetch-text.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "auth-md",
  title: "Auth.md",
  category: "can-agents-trust-you",
  severityTier: "notice",
};

async function run(ctx: CheckContext): Promise<CheckResult> {
  const rootResult = await fetchText(ctx, "/auth.md");
  if (rootResult?.ok) {
    return pass(meta, `/auth.md found (${rootResult.body.length} bytes)`);
  }
  const wellKnownResult = await fetchText(ctx, "/.well-known/auth.md");
  if (wellKnownResult?.ok) {
    return pass(
      meta,
      `/.well-known/auth.md found (${wellKnownResult.body.length} bytes)`,
    );
  }
  return fail(
    meta,
    "no auth.md found at / or /.well-known/",
    "Publish an auth.md self-service OAuth registration guide (see WorkOS's Auth.md protocol).",
  );
}

export const authMdCheck: Check = { ...meta, run };
