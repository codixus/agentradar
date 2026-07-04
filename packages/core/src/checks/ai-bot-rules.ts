import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { AI_BOT_TOKENS } from "./ai-bot-tokens.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "ai-bot-rules",
  title: "AI bot rules",
  category: "can-agents-find-you",
  severityTier: "warning",
  goal: "Name the AI crawlers you allow or block in robots.txt so agents know your stance.",
  resources: [
    { label: "RFC 9309", url: "https://www.rfc-editor.org/rfc/rfc9309" },
  ],
};

function matchedAiBotTokens(robotsBody: string): string[] {
  const matched: string[] = [];
  for (const line of robotsBody.split(/\r?\n/)) {
    const m = /^\s*user-agent\s*:\s*(.+?)\s*$/i.exec(line);
    if (!m) continue;
    const token = m[1];
    const hit = AI_BOT_TOKENS.find(
      (t) => t.toLowerCase() === token.toLowerCase(),
    );
    if (hit && !matched.includes(hit)) matched.push(hit);
  }
  return matched;
}

// robots.txt is prefetched once per scan and shared via ctx.robotsTxt (see
// scan.ts); its prefetch steps are shared as this check's transcript.
async function run(ctx: CheckContext): Promise<CheckResult> {
  const transcript = ctx.robotsTranscript ?? [];
  const result = ctx.robotsTxt;
  if (!result?.ok) {
    return {
      ...fail(
        meta,
        "no robots.txt found to declare AI-bot rules in",
        undefined,
        "robots.txt names no known AI crawler.",
      ),
      transcript,
    };
  }
  const matched = matchedAiBotTokens(result.body);
  if (matched.length === 0) {
    return {
      ...fail(
        meta,
        "robots.txt present but does not mention any known AI crawler",
        "Add a User-agent group for at least one AI crawler (e.g. GPTBot, ClaudeBot).",
        "robots.txt names no known AI crawler.",
      ),
      transcript,
    };
  }
  return {
    ...pass(meta, `declares rules for: ${matched.join(", ")}`),
    transcript,
  };
}

export const aiBotRulesCheck: Check = { ...meta, run };
