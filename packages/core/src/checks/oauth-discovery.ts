import type { Check, CheckMeta } from "../types.ts";
import { createWellKnownJsonCheck } from "./well-known-json.ts";

const meta: CheckMeta = {
  id: "oauth-discovery",
  title: "OAuth discovery",
  category: "can-agents-trust-you",
  severityTier: "notice",
  goal: "Publish OAuth authorization-server metadata so agents can authenticate on their own.",
  resources: [
    { label: "RFC 8414", url: "https://www.rfc-editor.org/rfc/rfc8414" },
  ],
};

export const oauthDiscoveryCheck: Check = createWellKnownJsonCheck({
  meta,
  path: "/.well-known/oauth-authorization-server",
  validate: (json) => {
    const doc = json as { issuer?: unknown; authorization_endpoint?: unknown };
    if (
      typeof doc?.issuer !== "string" ||
      typeof doc?.authorization_endpoint !== "string"
    ) {
      return {
        ok: false,
        detail:
          "oauth-authorization-server metadata found but missing issuer/authorization_endpoint (RFC 8414)",
      };
    }
    return { ok: true };
  },
  fixHint:
    "Publish RFC 8414 authorization server metadata at /.well-known/oauth-authorization-server.",
  issue:
    "No OAuth authorization-server metadata is published at /.well-known/oauth-authorization-server.",
});
