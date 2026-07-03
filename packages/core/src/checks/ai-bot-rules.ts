import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { AI_BOT_TOKENS } from "./ai-bot-tokens.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "ai-bot-rules",
  title: "AI bot rules",
  category: "can-agents-find-you",
  severityTier: "notice",
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

// robots.txt is prefetched once per scan and shared via ctx.robotsTxt (see scan.ts).
async function run(ctx: CheckContext): Promise<CheckResult> {
  const result = ctx.robotsTxt;
  if (!result?.ok) {
    return fail(meta, "no robots.txt found to declare AI-bot rules in");
  }
  const matched = matchedAiBotTokens(result.body);
  if (matched.length === 0) {
    return fail(
      meta,
      "robots.txt present but does not mention any known AI crawler",
      "Add a User-agent group for at least one AI crawler (e.g. GPTBot, ClaudeBot).",
    );
  }
  return pass(meta, `declares rules for: ${matched.join(", ")}`);
}

export const aiBotRulesCheck: Check = { ...meta, run };
