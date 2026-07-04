import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { createWellKnownJsonCheck } from "./well-known-json.ts";

const meta: CheckMeta = {
  id: "web-bot-auth",
  title: "Web Bot Auth",
  category: "can-agents-trust-you",
  severityTier: "notice",
  goal: "Publish a signing-key directory so agents can prove which bot they are.",
  resources: [
    { label: "RFC 9421", url: "https://www.rfc-editor.org/rfc/rfc9421" },
  ],
};

const keyDirectoryCheck = createWellKnownJsonCheck({
  meta,
  path: "/.well-known/http-message-signatures-directory",
  validate: (json) => {
    const doc = json as { keys?: unknown };
    if (!Array.isArray(doc?.keys)) {
      return {
        ok: false,
        detail:
          "http-message-signatures-directory found but has no keys array (RFC 7517 JWKS)",
      };
    }
    return { ok: true };
  },
  fixHint:
    "Publish a signing key directory at /.well-known/http-message-signatures-directory.",
});

// Best-effort/inferred: a plain outbound GET can confirm a site *publishes*
// a key directory, but cannot confirm it actually verifies incoming signed
// bot requests. Tagged inferred so the report does not present this with
// the same confidence as a fully verified check.
async function run(ctx: CheckContext): Promise<CheckResult> {
  const result = await keyDirectoryCheck.run(ctx);
  return { ...result, inferred: true };
}

export const webBotAuthCheck: Check = { ...meta, run };
