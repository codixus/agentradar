import type {
  Check,
  CheckContext,
  CheckMeta,
  CheckResult,
  HttpStep,
} from "../types.ts";
import { fetchRaw } from "./fetch-raw.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "markdown-negotiation",
  title: "Markdown negotiation",
  category: "can-agents-read-you",
  severityTier: "error",
  goal: "Serve clean Markdown when an agent asks for it, instead of HTML meant for browsers.",
  resources: [
    {
      label: "HTTP content negotiation (RFC 9110)",
      url: "https://www.rfc-editor.org/rfc/rfc9110#name-accept",
    },
  ],
};

async function run(ctx: CheckContext): Promise<CheckResult> {
  const transcript: HttpStep[] = [];
  const res = await fetchRaw(
    ctx,
    ctx.baseUrl,
    { headers: { accept: "text/markdown, text/html;q=0.8" } },
    transcript,
  );
  if (!res) {
    return {
      ...fail(
        meta,
        `could not reach ${ctx.baseUrl.href}`,
        undefined,
        "The site does not serve Markdown to agents that ask for it.",
      ),
      transcript,
    };
  }
  const contentType = res.headers.get("content-type") ?? "";
  // This check only needs the content-type header, not the body.
  await res.body?.cancel().catch(() => {});
  if (contentType.toLowerCase().startsWith("text/markdown")) {
    return { ...pass(meta, `responded with ${contentType}`), transcript };
  }
  return {
    ...fail(
      meta,
      `responded with "${contentType || "no content-type"}" instead of text/markdown`,
      "Serve text/markdown when the request's Accept header prefers it over text/html.",
      "The site does not serve Markdown to agents that ask for it.",
    ),
    transcript,
  };
}

export const markdownNegotiationCheck: Check = { ...meta, run };
