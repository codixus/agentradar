import type { Check, CheckMeta } from "../types.ts";
import { createWellKnownJsonCheck } from "./well-known-json.ts";

const meta: CheckMeta = {
  id: "api-catalog",
  title: "API Catalog",
  category: "can-agents-trust-you",
  severityTier: "notice",
};

export const apiCatalogCheck: Check = createWellKnownJsonCheck({
  meta,
  path: "/.well-known/api-catalog",
  validate: (json) => {
    const linkset = (json as { linkset?: unknown })?.linkset;
    if (!Array.isArray(linkset)) {
      return {
        ok: false,
        detail:
          "/.well-known/api-catalog found but has no linkset array (RFC 9727)",
      };
    }
    return { ok: true };
  },
  fixHint: "Publish an RFC 9727 API catalog at /.well-known/api-catalog.",
});
