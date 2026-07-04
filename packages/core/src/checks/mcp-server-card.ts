import type { Check, CheckMeta } from "../types.ts";
import { createWellKnownJsonCheck } from "./well-known-json.ts";

const meta: CheckMeta = {
  id: "mcp-server-card",
  title: "MCP Server Card",
  category: "can-agents-trust-you",
  severityTier: "notice",
  goal: "Advertise your MCP server with a discoverable server card so agents can connect.",
  resources: [
    {
      label: "Model Context Protocol",
      url: "https://modelcontextprotocol.io",
    },
  ],
};

// SEP-2127, Draft/Extensions Track: the well-known path has moved across
// draft revisions and is not final. This checks the most recently
// documented path only (discovery, not a live MCP handshake).
export const mcpServerCardCheck: Check = createWellKnownJsonCheck({
  meta,
  path: "/.well-known/mcp/server-card.json",
  validate: (json) => {
    const doc = json as { name?: unknown };
    if (typeof doc?.name !== "string") {
      return {
        ok: false,
        detail: "mcp/server-card.json found but has no name field",
      };
    }
    return { ok: true };
  },
  fixHint:
    "Publish an MCP Server Card at /.well-known/mcp/server-card.json (spec is Draft, re-verify the path before relying on this).",
  issue:
    "No MCP Server Card is published at /.well-known/mcp/server-card.json.",
});
