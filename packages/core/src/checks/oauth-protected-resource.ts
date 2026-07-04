import type { Check, CheckMeta } from "../types.ts";
import { createWellKnownJsonCheck } from "./well-known-json.ts";

const meta: CheckMeta = {
  id: "oauth-protected-resource",
  title: "OAuth Protected Resource",
  category: "can-agents-trust-you",
  severityTier: "notice",
  goal: "Tell agents which authorization servers guard your API with protected-resource metadata.",
  resources: [
    { label: "RFC 9728", url: "https://www.rfc-editor.org/rfc/rfc9728" },
  ],
};

export const oauthProtectedResourceCheck: Check = createWellKnownJsonCheck({
  meta,
  path: "/.well-known/oauth-protected-resource",
  validate: (json) => {
    const doc = json as { resource?: unknown; authorization_servers?: unknown };
    if (
      typeof doc?.resource !== "string" ||
      !Array.isArray(doc?.authorization_servers)
    ) {
      return {
        ok: false,
        detail:
          "oauth-protected-resource metadata found but missing resource/authorization_servers (RFC 9728)",
      };
    }
    return { ok: true };
  },
  fixHint:
    "Publish RFC 9728 protected resource metadata at /.well-known/oauth-protected-resource.",
  issue:
    "No OAuth protected-resource metadata is published at /.well-known/oauth-protected-resource.",
});
