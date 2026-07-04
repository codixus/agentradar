import type { Check, CheckMeta } from "../types.ts";
import { createWellKnownJsonCheck } from "./well-known-json.ts";

const meta: CheckMeta = {
  id: "agent-skills",
  title: "Agent Skills",
  category: "can-agents-trust-you",
  severityTier: "notice",
};

// Checks Cloudflare's proposed web-discoverable index, not Anthropic's local
// SKILL.md convention (which has no well-known URI to check at all).
export const agentSkillsCheck: Check = createWellKnownJsonCheck({
  meta,
  path: "/.well-known/agent-skills/index.json",
  fixHint:
    "Publish an agent skills index at /.well-known/agent-skills/index.json.",
});
