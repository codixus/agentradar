import { afterEach, describe, expect, test } from "bun:test";
import { runChecks, runScan } from "./scan.ts";
import type { Check, CheckContext } from "./types.ts";

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

function stalledBodyResponse(
  firstChunk: string,
  secondChunk: string,
  stallMs: number,
  init: ResponseInit = {},
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(new TextEncoder().encode(firstChunk));
      await new Promise((resolve) => setTimeout(resolve, stallMs));
      controller.enqueue(new TextEncoder().encode(secondChunk));
      controller.close();
    },
  });
  return new Response(stream, init);
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
    for (const category of result.categories) {
      expect(category.score).toBe(100);
    }
  });

  test("fully missing: no agent-visibility signals present, every check fails, and category scores reflect that (not just the composite)", async () => {
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
    // every category is 100% failing here -- none should report a passing score.
    for (const category of result.categories) {
      expect(category.score).toBe(0);
    }
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

  test("unreachable target: headers that never arrive are aborted by the timeout, not left to hang forever", async () => {
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

  test("unreachable target: a body that stalls after headers arrive is also aborted by the timeout", async () => {
    // headers resolve immediately, but the body stream stalls for 2s -- this
    // is the case a header-only timeout would miss (see fetch-text.ts).
    const server = startFixtureServer({
      "/robots.txt": () =>
        stalledBodyResponse("User-agent: *\n", "Disallow:\n", 2000),
    });

    const start = Date.now();
    const result = await runScan(server.url.href, { timeoutMs: 50 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1500);
    const robotsCheck = result.checks.find((c) => c.id === "robots-txt");
    expect(robotsCheck?.passed).toBe(false);
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

  test("scoring boundary: only warning/notice-tier checks fail, the error-tier check passes, composite score stays top-band while the failing category does not", async () => {
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

    // the composite score is deliberately lenient (only error-tier counts),
    // but a category made entirely of failing warning/notice checks must
    // not itself read as a perfect 100 -- that would mislead the report.
    const findCategory = result.categories.find(
      (c) => c.category === "can-agents-find-you",
    );
    expect(findCategory?.checks.every((c) => !c.passed)).toBe(true);
    expect(findCategory?.score).toBe(0);
  });

  test("rejects non-http(s) schemes with a clean error instead of attempting to scan them", async () => {
    await expect(runScan("file:///etc/passwd")).rejects.toThrow(/http/i);
  });
});

describe("runChecks", () => {
  test("a check that throws is isolated: the scan still returns a result for it instead of crashing", async () => {
    const throwingCheck: Check = {
      id: "boom",
      title: "Boom",
      category: "test",
      severityTier: "notice",
      async run() {
        throw new Error("kaboom");
      },
    };
    const ctx: CheckContext = {
      baseUrl: new URL("http://example.com"),
      fetchImpl: fetch,
      timeoutMs: 1000,
      robotsTxt: null,
    };

    const results = await runChecks([throwingCheck], ctx);

    expect(results).toHaveLength(1);
    expect(results[0]?.passed).toBe(false);
    expect(results[0]?.evidence).toContain("crashed");
  });
});
