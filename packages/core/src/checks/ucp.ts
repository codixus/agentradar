import type { Check, CheckMeta } from "../types.ts";
import { createWellKnownJsonCheck } from "./well-known-json.ts";

const meta: CheckMeta = {
  id: "ucp",
  title: "Universal Commerce Protocol",
  category: "can-agents-trust-you",
  severityTier: "notice",
  goal: "Publish a UCP manifest so commerce agents can transact with you.",
  resources: [{ label: "UCP", url: "https://ucp.dev" }],
};

export const ucpCheck: Check = createWellKnownJsonCheck({
  meta,
  path: "/.well-known/ucp",
  fixHint:
    "Publish a UCP capability manifest at /.well-known/ucp (see ucp.dev).",
  issue: "No UCP capability manifest is published at /.well-known/ucp.",
});
