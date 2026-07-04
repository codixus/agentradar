import type {
  Check,
  CheckContext,
  CheckMeta,
  CheckResult,
  HttpStep,
} from "../types.ts";
import { fetchText } from "./fetch-text.ts";
import { fail, pass } from "./util.ts";

const meta: CheckMeta = {
  id: "auth-md",
  title: "Auth.md",
  category: "can-agents-trust-you",
  severityTier: "notice",
  goal: "Give agents a self-service guide to register and authenticate against your API.",
  resources: [
    { label: "WorkOS", url: "https://workos.com" },
    { label: "workos/auth.md", url: "https://github.com/workos/auth.md" },
  ],
};

async function run(ctx: CheckContext): Promise<CheckResult> {
  const transcript: HttpStep[] = [];
  const rootResult = await fetchText(ctx, "/auth.md", undefined, transcript);
  if (rootResult?.ok) {
    return {
      ...pass(meta, `/auth.md found (${rootResult.body.length} bytes)`),
      transcript,
    };
  }
  const wellKnownResult = await fetchText(
    ctx,
    "/.well-known/auth.md",
    undefined,
    transcript,
  );
  if (wellKnownResult?.ok) {
    return {
      ...pass(
        meta,
        `/.well-known/auth.md found (${wellKnownResult.body.length} bytes)`,
      ),
      transcript,
    };
  }
  return {
    ...fail(
      meta,
      "no auth.md found at / or /.well-known/",
      "Publish an auth.md self-service OAuth registration guide (see WorkOS's Auth.md protocol).",
      "No auth.md registration guide is published at / or /.well-known/.",
    ),
    transcript,
  };
}

export const authMdCheck: Check = { ...meta, run };
