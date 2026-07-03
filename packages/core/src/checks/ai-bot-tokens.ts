// Pinned snapshot of well-known AI crawler user-agent tokens (research notes
// section 2). This list is a fast-moving community convention, not a
// registry -- refresh it periodically rather than treating it as final.
export const AI_BOT_TOKENS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "CCBot",
  "Bytespider",
  "Applebot-Extended",
  "Amazonbot",
] as const;
