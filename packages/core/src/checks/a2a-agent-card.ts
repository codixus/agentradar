import type { Check, CheckMeta } from "../types.ts";
import { createWellKnownJsonCheck } from "./well-known-json.ts";

const meta: CheckMeta = {
  id: "a2a-agent-card",
  title: "A2A Agent Card",
  category: "can-agents-trust-you",
  severityTier: "notice",
  goal: "Publish an A2A agent card so other agents can discover and call yours.",
  resources: [{ label: "A2A Protocol", url: "https://a2a-protocol.org" }],
};

export const a2aAgentCardCheck: Check = createWellKnownJsonCheck({
  meta,
  path: "/.well-known/agent-card.json",
  validate: (json) => {
    const doc = json as { name?: unknown; url?: unknown };
    if (typeof doc?.name !== "string" || typeof doc?.url !== "string") {
      return {
        ok: false,
        detail: "agent-card.json found but missing name/url",
      };
    }
    return { ok: true };
  },
  fixHint: "Publish an A2A Agent Card at /.well-known/agent-card.json.",
  issue: "No A2A Agent Card is published at /.well-known/agent-card.json.",
});
