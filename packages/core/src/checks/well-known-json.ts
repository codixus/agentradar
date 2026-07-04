import type { Check, CheckContext, CheckMeta, CheckResult } from "../types.ts";
import { fetchText } from "./fetch-text.ts";
import { fail, pass } from "./util.ts";

export interface WellKnownJsonCheckOptions {
  meta: CheckMeta;
  path: string;
  validate?: (json: unknown) => { ok: boolean; detail?: string };
  fixHint?: string;
}

// Shared shape for the several checks that are all "GET a well-known JSON
// document, does it exist and look like the right shape" (API Catalog,
// OAuth discovery, OAuth Protected Resource, MCP Server Card, A2A Agent
// Card, Agent Skills, UCP, Web Bot Auth's key directory).
export function createWellKnownJsonCheck(
  opts: WellKnownJsonCheckOptions,
): Check {
  async function run(ctx: CheckContext): Promise<CheckResult> {
    const result = await fetchText(ctx, opts.path);
    if (!result) {
      return fail(opts.meta, `could not reach ${opts.path}`, opts.fixHint);
    }
    if (!result.ok) {
      return fail(
        opts.meta,
        `GET ${opts.path} returned ${result.status}`,
        opts.fixHint,
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(result.body);
    } catch {
      // Many SPAs answer every unknown path with 200 + their index.html
      // (a "soft 404") instead of a real 404. Without this guard every absent
      // well-known JSON doc would be misreported as "found but is not valid
      // JSON". An HTML content-type on a JSON endpoint is that catch-all, not a
      // malformed document -- report it as absent. A non-HTML body that still
      // fails to parse is a genuinely malformed file and keeps that wording.
      if (result.contentType.toLowerCase().includes("text/html")) {
        return fail(
          opts.meta,
          `no ${opts.path} found (server returned an HTML page, likely a catch-all)`,
          opts.fixHint,
        );
      }
      return fail(
        opts.meta,
        `${opts.path} found but is not valid JSON`,
        opts.fixHint,
      );
    }
    if (opts.validate) {
      const verdict = opts.validate(json);
      if (!verdict.ok) {
        return fail(
          opts.meta,
          verdict.detail ?? `${opts.path} found but does not look valid`,
          opts.fixHint,
        );
      }
    }
    return pass(opts.meta, `${opts.path} found and valid`);
  }
  return { ...opts.meta, run };
}
