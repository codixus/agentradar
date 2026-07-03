import { afterEach, describe, expect, test } from "bun:test";
import { runScan } from "./scan.ts";

type RouteHandler = (req: Request) => Response | Promise<Response>;

let activeServer: ReturnType<typeof Bun.serve> | null = null;

function startFixtureServer(routes: Record<string, RouteHandler>) {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      const handler = routes[url.pathname];
      if (handler) return handler(req);
      return new Response("not found", { status: 404 });
    },
  });
  activeServer = server;
  return server;
}

afterEach(() => {
  activeServer?.stop(true);
  activeServer = null;
});

function textResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, ...init });
}

const GOOD_ROBOTS = [
  "User-agent: GPTBot",
  "Disallow:",
  "",
  "User-agent: *",
  "Disallow:",
  "Content-Signal: search=yes, ai-train=yes, ai-input=yes",
  "",
].join("\n");

const GOOD_SITEMAP =
  '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/</loc></url></urlset>';

const GOOD_LLMS_TXT =
  "# Example\n\n> A test site used for AgentSight fixtures.\n";

function markdownAwareHomepage(req: Request): Response {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/markdown")) {
    return textResponse("# Example\n\nHello agent.", {
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  }
  return textResponse("<html><body>Hello human</body></html>", {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

describe("runScan", () => {
  test("happy path: a fully agent-ready site passes every check", async () => {
    const server = startFixtureServer({
      "/robots.txt": () => textResponse(GOOD_ROBOTS),
      "/sitemap.xml": () =>
        textResponse(GOOD_SITEMAP, {
          headers: { "content-type": "application/xml" },
        }),
      "/llms.txt": () => textResponse(GOOD_LLMS_TXT),
      "/": markdownAwareHomepage,
    });

    const result = await runScan(server.url.href);

    expect(result.checks).toHaveLength(6);
    for (const check of result.checks) {
      expect(check.passed).toBe(true);
    }
    expect(result.score).toBe(100);
    expect(result.grade).toBe("A");
  });

  test("fully missing: no agent-visibility signals present, every check fails", async () => {
    const server = startFixtureServer({
      "/": () =>
        textResponse("<html><body>Hello human</body></html>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    });

    const result = await runScan(server.url.href);

    for (const check of result.checks) {
      expect(check.passed).toBe(false);
    }
    // markdown-negotiation is the only error-tier check in this batch, and it fails here.
    expect(result.score).toBe(0);
    expect(result.grade).toBe("F");
  });

  test("malformed response: garbled robots.txt fails gracefully instead of crashing the scan", async () => {
    const server = startFixtureServer({
      "/robots.txt": () =>
        textResponse("\x00\x01BINARYGARBAGE\xFF not a robots file at all"),
      "/sitemap.xml": () => textResponse(GOOD_SITEMAP),
      "/llms.txt": () => textResponse(GOOD_LLMS_TXT),
      "/": markdownAwareHomepage,
    });

    const result = await runScan(server.url.href);

    const robotsCheck = result.checks.find((c) => c.id === "robots-txt");
    const aiBotRulesCheck = result.checks.find((c) => c.id === "ai-bot-rules");
    const contentSignalsCheck = result.checks.find(
      (c) => c.id === "content-signals",
    );
    expect(robotsCheck?.passed).toBe(false);
    expect(aiBotRulesCheck?.passed).toBe(false);
    expect(contentSignalsCheck?.passed).toBe(false);
    // the scan itself must complete, not throw
    expect(result.checks).toHaveLength(6);
  });

  test("unreachable target: connection refused is reported as failed checks, not an unhandled rejection", async () => {
    // nothing listens on this port: server was never started for this test
    const unreachableUrl = "http://127.0.0.1:1";

    const result = await runScan(unreachableUrl);

    expect(result.checks).toHaveLength(6);
    for (const check of result.checks) {
      expect(check.passed).toBe(false);
      expect(check.evidence.length).toBeGreaterThan(0);
    }
  });

  test("unreachable target: a hanging response is aborted by the timeout, not left to hang forever", async () => {
    const server = startFixtureServer({
      "/": async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return textResponse("too slow");
      },
    });

    const start = Date.now();
    const result = await runScan(server.url.href, { timeoutMs: 50 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1500);
    const markdownCheck = result.checks.find(
      (c) => c.id === "markdown-negotiation",
    );
    expect(markdownCheck?.passed).toBe(false);
  });

  test("content negotiation edge case: a server that ignores Accept and always returns HTML must fail, not false-positive", async () => {
    const server = startFixtureServer({
      "/robots.txt": () => textResponse(GOOD_ROBOTS),
      "/sitemap.xml": () => textResponse(GOOD_SITEMAP),
      "/llms.txt": () => textResponse(GOOD_LLMS_TXT),
      "/": () =>
        textResponse("<html><body>always html</body></html>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    });

    const result = await runScan(server.url.href);

    const markdownCheck = result.checks.find(
      (c) => c.id === "markdown-negotiation",
    );
    expect(markdownCheck?.passed).toBe(false);
  });

  test("scoring boundary: only warning/notice-tier checks fail, the error-tier check passes, score stays top-band", async () => {
    const server = startFixtureServer({
      // robots.txt, sitemap, llms.txt all 404 (default handler) -> warning/notice checks fail
      "/": markdownAwareHomepage, // markdown-negotiation (the only error-tier check) passes
    });

    const result = await runScan(server.url.href);

    const failing = result.checks.filter((c) => !c.passed);
    const passing = result.checks.filter((c) => c.passed);
    expect(failing.length).toBeGreaterThan(0);
    expect(passing.length).toBeGreaterThan(0);
    expect(result.score).toBe(100);
    expect(result.grade).toBe("A");
  });
});
