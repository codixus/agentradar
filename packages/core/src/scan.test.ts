import { afterEach, describe, expect, test } from "bun:test";
import { categoryScore, runChecks, runScan } from "./scan.ts";
import type { Check, CheckContext, CheckResult } from "./types.ts";

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

function jsonResponse(json: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
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

// Every scan.test.ts test routes through this instead of the bare default
// fetch, so DNS-AID's DNS-over-HTTPS lookup (a real external host,
// cloudflare-dns.com) never makes a live network call in CI -- it's
// intercepted here with a canned answer, everything else is delegated to
// the real fetch, which reaches the local Bun.serve fixture.
function createTestFetch(
  options: { dnsAidHasAnswer?: boolean } = {},
): typeof fetch {
  return (async (...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    const url =
      input instanceof URL
        ? input.href
        : typeof input === "string"
          ? input
          : input.url;
    if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
      const body = options.dnsAidHasAnswer
        ? {
            Answer: [
              { name: "_index._agents.test", type: 64, data: "fake-svcb-data" },
            ],
          }
        : {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return fetch(input, init);
  }) as typeof fetch;
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
  const linkHeader = { link: '</llms.txt>; rel="describedby"' };
  if (accept.includes("text/markdown")) {
    return textResponse("# Example\n\nHello agent.", {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        ...linkHeader,
      },
    });
  }
  return textResponse("<html><body>Hello human</body></html>", {
    headers: { "content-type": "text/html; charset=utf-8", ...linkHeader },
  });
}

const FULLY_AGENT_READY_ROUTES: Record<string, RouteHandler> = {
  "/robots.txt": () => textResponse(GOOD_ROBOTS),
  "/sitemap.xml": () =>
    textResponse(GOOD_SITEMAP, {
      headers: { "content-type": "application/xml" },
    }),
  "/llms.txt": () => textResponse(GOOD_LLMS_TXT),
  "/": markdownAwareHomepage,
  "/.well-known/apple-app-site-association": () =>
    jsonResponse({ applinks: { details: [] } }),
  "/.well-known/assetlinks.json": () =>
    jsonResponse([
      { relation: ["delegate_permission/common.handle_all_urls"], target: {} },
    ]),
  "/.well-known/api-catalog": () =>
    jsonResponse({
      linkset: [{ anchor: "/", "service-desc": [{ href: "/openapi.json" }] }],
    }),
  "/.well-known/oauth-authorization-server": () =>
    jsonResponse({
      issuer: "https://example.com",
      authorization_endpoint: "https://example.com/authorize",
    }),
  "/.well-known/oauth-protected-resource": () =>
    jsonResponse({
      resource: "https://example.com",
      authorization_servers: ["https://example.com"],
    }),
  "/auth.md": () => textResponse("# Auth\n\nRegister via /register.\n"),
  "/.well-known/mcp/server-card.json": () =>
    jsonResponse({ name: "com.example.agent", version: "1.0.0" }),
  "/.well-known/agent-card.json": () =>
    jsonResponse({ name: "Example Agent", url: "https://example.com/a2a" }),
  "/.well-known/agent-skills/index.json": () => jsonResponse({ skills: [] }),
  "/.well-known/ucp": () =>
    jsonResponse({ capabilities: ["dev.ucp.shopping.checkout"] }),
  "/.well-known/http-message-signatures-directory": () =>
    jsonResponse({ keys: [{ kty: "OKP", kid: "test" }] }),
};

describe("runScan", () => {
  test("happy path: every check that can realistically pass on one URL passes", async () => {
    const server = startFixtureServer(FULLY_AGENT_READY_ROUTES);
    const fetchImpl = createTestFetch({ dnsAidHasAnswer: true });

    const result = await runScan(server.url.href, { fetchImpl });

    expect(result.checks).toHaveLength(20);

    // x402 and mpp cannot pass here by design: x402 needs the site root to
    // respond 402 (incompatible with markdown-negotiation's 200 on the same
    // URL), and mpp has no discovery mechanism at all and always reports
    // inconclusive (see checks/mpp.ts).
    const alwaysExcluded = new Set(["x402", "mpp"]);
    for (const check of result.checks) {
      if (alwaysExcluded.has(check.id)) continue;
      expect(check.passed).toBe(true);
    }
    const x402Result = result.checks.find((c) => c.id === "x402");
    expect(x402Result?.passed).toBe(false);
    const mppResult = result.checks.find((c) => c.id === "mpp");
    expect(mppResult?.passed).toBe(false);
    expect(mppResult?.inferred).toBe(true);

    // composite score only counts the error-tier check (markdown-negotiation), which passes here
    expect(result.score).toBe(100);
    expect(result.grade).toBe("A");

    const findYou = result.categories.find(
      (c) => c.category === "can-agents-find-you",
    );
    const readYou = result.categories.find(
      (c) => c.category === "can-agents-read-you",
    );
    const reachApp = result.categories.find(
      (c) => c.category === "can-agents-reach-your-app",
    );
    const trustYou = result.categories.find(
      (c) => c.category === "can-agents-trust-you",
    );
    expect(findYou?.score).toBe(100);
    expect(readYou?.score).toBe(100);
    expect(reachApp?.score).toBe(100);
    // trust-you category contains x402 and mpp, which always fail -- it cannot be 100.
    expect(trustYou?.score).toBeLessThan(100);
  });

  test("fully missing: no agent-visibility signals present, every check fails, and category scores reflect that (not just the composite)", async () => {
    const server = startFixtureServer({
      "/": () =>
        textResponse("<html><body>Hello human</body></html>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    });

    const result = await runScan(server.url.href, {
      fetchImpl: createTestFetch(),
    });

    expect(result.checks).toHaveLength(20);
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

    const result = await runScan(server.url.href, {
      fetchImpl: createTestFetch(),
    });

    const robotsCheck = result.checks.find((c) => c.id === "robots-txt");
    const aiBotRulesCheck = result.checks.find((c) => c.id === "ai-bot-rules");
    const contentSignalsCheck = result.checks.find(
      (c) => c.id === "content-signals",
    );
    expect(robotsCheck?.passed).toBe(false);
    expect(aiBotRulesCheck?.passed).toBe(false);
    expect(contentSignalsCheck?.passed).toBe(false);
    // the scan itself must complete, not throw
    expect(result.checks).toHaveLength(20);
  });

  test("unreachable target: connection refused is reported as failed checks, not an unhandled rejection", async () => {
    // nothing listens on this port: server was never started for this test
    const unreachableUrl = "http://127.0.0.1:1";

    const result = await runScan(unreachableUrl, {
      fetchImpl: createTestFetch(),
    });

    expect(result.checks).toHaveLength(20);
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
    const result = await runScan(server.url.href, {
      timeoutMs: 50,
      fetchImpl: createTestFetch(),
    });
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
    const result = await runScan(server.url.href, {
      timeoutMs: 50,
      fetchImpl: createTestFetch(),
    });
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

    const result = await runScan(server.url.href, {
      fetchImpl: createTestFetch(),
    });

    const markdownCheck = result.checks.find(
      (c) => c.id === "markdown-negotiation",
    );
    expect(markdownCheck?.passed).toBe(false);
  });

  test("link headers: service-desc/service-doc alone (no api-catalog or describedby) still passes, matching a real Cloudflare Link header shape", async () => {
    const server = startFixtureServer({
      "/": () =>
        textResponse("<html></html>", {
          headers: {
            "content-type": "text/html; charset=utf-8",
            link: '<https://example.com/openapi.json>; rel="service-desc", <https://example.com/llms.txt>; rel="service-doc"',
          },
        }),
    });

    const result = await runScan(server.url.href, {
      fetchImpl: createTestFetch(),
    });

    expect(result.checks.find((c) => c.id === "link-headers")?.passed).toBe(
      true,
    );
  });

  test("AI bot rules: matches Claude-Web and cohere-ai, not just the more common tokens", async () => {
    const server = startFixtureServer({
      "/robots.txt": () =>
        textResponse(
          "User-agent: Claude-Web\nAllow: /\n\nUser-agent: cohere-ai\nAllow: /\n",
        ),
    });

    const result = await runScan(server.url.href, {
      fetchImpl: createTestFetch(),
    });

    const aiBotRules = result.checks.find((c) => c.id === "ai-bot-rules");
    expect(aiBotRules?.passed).toBe(true);
    expect(aiBotRules?.evidence).toContain("Claude-Web");
    expect(aiBotRules?.evidence).toContain("cohere-ai");
  });

  test("scoring boundary: only warning/notice-tier checks fail, the error-tier check passes, composite score stays top-band while the failing category does not", async () => {
    const server = startFixtureServer({
      // robots.txt, sitemap, llms.txt, link headers all absent (default 404,
      // no Link header) -> every check in can-agents-find-you fails
      "/": (req: Request) => {
        const accept = req.headers.get("accept") ?? "";
        if (accept.includes("text/markdown")) {
          return textResponse("# Example", {
            headers: { "content-type": "text/markdown; charset=utf-8" },
          });
        }
        return textResponse("<html></html>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }, // markdown-negotiation (the only error-tier check) passes; no Link header sent
    });

    const result = await runScan(server.url.href, {
      fetchImpl: createTestFetch(),
    });

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

  test("robots.txt is fetched exactly once per scan, shared across the three checks that need it", async () => {
    let robotsTxtRequests = 0;
    const server = startFixtureServer({
      "/robots.txt": () => {
        robotsTxtRequests += 1;
        return textResponse(GOOD_ROBOTS);
      },
      "/sitemap.xml": () => textResponse(GOOD_SITEMAP),
      "/llms.txt": () => textResponse(GOOD_LLMS_TXT),
      "/": markdownAwareHomepage,
    });

    await runScan(server.url.href, { fetchImpl: createTestFetch() });

    expect(robotsTxtRequests).toBe(1);
  });

  test("DNS-AID: an SVCB answer at the discovery hostname passes; no answer fails, both without a live DNS query", async () => {
    const server = startFixtureServer({});

    const withAnswer = await runScan(server.url.href, {
      fetchImpl: createTestFetch({ dnsAidHasAnswer: true }),
    });
    const withoutAnswer = await runScan(server.url.href, {
      fetchImpl: createTestFetch({ dnsAidHasAnswer: false }),
    });

    expect(withAnswer.checks.find((c) => c.id === "dns-aid")?.passed).toBe(
      true,
    );
    expect(withoutAnswer.checks.find((c) => c.id === "dns-aid")?.passed).toBe(
      false,
    );
  });

  test("DNS-AID: NXDOMAIN (Status 3, the common case for a brand-new discovery name) reads as no-record-found, not a resolver error", async () => {
    const server = startFixtureServer({});
    const nxdomainFetch = ((
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url =
        input instanceof URL
          ? input.href
          : typeof input === "string"
            ? input
            : input.url;
      if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
        return Promise.resolve(
          new Response(JSON.stringify({ Status: 3 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return fetch(input, init);
    }) as typeof fetch;

    const result = await runScan(server.url.href, { fetchImpl: nxdomainFetch });

    const dnsAid = result.checks.find((c) => c.id === "dns-aid");
    expect(dnsAid?.passed).toBe(false);
    expect(dnsAid?.evidence).toContain("no SVCB record found");
    expect(dnsAid?.evidence).not.toContain("error");
  });

  test("DNS-AID: a real resolver error (SERVFAIL, Status 2) is reported distinctly from a genuine no-record answer", async () => {
    const server = startFixtureServer({});
    const servfailFetch = ((
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url =
        input instanceof URL
          ? input.href
          : typeof input === "string"
            ? input
            : input.url;
      if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
        return Promise.resolve(
          new Response(JSON.stringify({ Status: 2 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return fetch(input, init);
    }) as typeof fetch;

    const result = await runScan(server.url.href, { fetchImpl: servfailFetch });

    const dnsAid = result.checks.find((c) => c.id === "dns-aid");
    expect(dnsAid?.passed).toBe(false);
    expect(dnsAid?.evidence).toContain("resolver returned an error");
  });

  test("DNS-AID: a resolver that hangs is bounded by timeoutMs, not left to hang the whole scan", async () => {
    const server = startFixtureServer({});
    // A mock fetch must honor the abort signal itself to realistically stand
    // in for the real fetch() -- otherwise this test would prove nothing
    // about fetchRaw's timeout wiring, only about a mock that never hangs.
    const hangingDohFetch = ((
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url =
        input instanceof URL
          ? input.href
          : typeof input === "string"
            ? input
            : input.url;
      if (!url.startsWith("https://cloudflare-dns.com/dns-query")) {
        return fetch(input, init);
      }
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            resolve(
              new Response(JSON.stringify({}), {
                status: 200,
                headers: { "content-type": "application/json" },
              }),
            ),
          2000,
        );
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    }) as typeof fetch;

    const start = Date.now();
    const result = await runScan(server.url.href, {
      timeoutMs: 50,
      fetchImpl: hangingDohFetch,
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1500);
    expect(result.checks.find((c) => c.id === "dns-aid")?.passed).toBe(false);
  });

  test("x402: a 402 with a payment-required header passes; a plain 402 or a normal 200 does not", async () => {
    const gatedServer = startFixtureServer({
      "/": () =>
        new Response("payment required", {
          status: 402,
          headers: { "payment-required": "1" },
        }),
    });
    const bareServer = startFixtureServer({
      "/": () => new Response("payment required", { status: 402 }),
    });

    const gatedResult = await runScan(gatedServer.url.href, {
      fetchImpl: createTestFetch(),
    });
    gatedServer.stop(true);
    const bareResult = await runScan(bareServer.url.href, {
      fetchImpl: createTestFetch(),
    });

    expect(gatedResult.checks.find((c) => c.id === "x402")?.passed).toBe(true);
    expect(bareResult.checks.find((c) => c.id === "x402")?.passed).toBe(false);
  });

  test("MPP always reports an inconclusive, inferred result regardless of the target -- it never fabricates a pass", async () => {
    const server = startFixtureServer(FULLY_AGENT_READY_ROUTES);

    const result = await runScan(server.url.href, {
      fetchImpl: createTestFetch({ dnsAidHasAnswer: true }),
    });

    const mpp = result.checks.find((c) => c.id === "mpp");
    expect(mpp?.passed).toBe(false);
    expect(mpp?.inferred).toBe(true);
    expect(mpp?.evidence).toContain("cannot be verified");
  });

  test("Web Bot Auth is tagged inferred: true even when the key directory is found (existence, not enforcement, is verified)", async () => {
    const server = startFixtureServer({
      "/.well-known/http-message-signatures-directory": () =>
        jsonResponse({ keys: [{ kty: "OKP", kid: "test" }] }),
    });

    const result = await runScan(server.url.href, {
      fetchImpl: createTestFetch(),
    });

    const webBotAuth = result.checks.find((c) => c.id === "web-bot-auth");
    expect(webBotAuth?.passed).toBe(true);
    expect(webBotAuth?.inferred).toBe(true);
  });

  test("deep-link association: a valid apple-app-site-association alone is enough to pass", async () => {
    const server = startFixtureServer({
      "/.well-known/apple-app-site-association": () =>
        jsonResponse({ applinks: { details: [] } }),
    });

    const result = await runScan(server.url.href, {
      fetchImpl: createTestFetch(),
    });

    expect(
      result.checks.find((c) => c.id === "deep-link-association")?.passed,
    ).toBe(true);
  });

  test("deep-link association: valid JSON that is not the right shape does not false-positive", async () => {
    const server = startFixtureServer({
      "/.well-known/apple-app-site-association": () =>
        jsonResponse({ unrelated: true }),
      "/.well-known/assetlinks.json": () => jsonResponse({ not: "an array" }),
    });

    const result = await runScan(server.url.href, {
      fetchImpl: createTestFetch(),
    });

    expect(
      result.checks.find((c) => c.id === "deep-link-association")?.passed,
    ).toBe(false);
  });

  test("well-known JSON checks (shared factory): a non-JSON 200 body fails without crashing", async () => {
    const server = startFixtureServer({
      "/.well-known/api-catalog": () =>
        textResponse("<html>not json</html>", {
          headers: { "content-type": "text/html" },
        }),
    });

    const result = await runScan(server.url.href, {
      fetchImpl: createTestFetch(),
    });

    const apiCatalog = result.checks.find((c) => c.id === "api-catalog");
    expect(apiCatalog?.passed).toBe(false);
    expect(apiCatalog?.evidence).toContain("not valid JSON");
  });

  test("well-known JSON checks (shared factory): valid JSON in the wrong shape fails, not a false pass", async () => {
    const server = startFixtureServer({
      "/.well-known/api-catalog": () => jsonResponse({ unrelated: "field" }),
    });

    const result = await runScan(server.url.href, {
      fetchImpl: createTestFetch(),
    });

    const apiCatalog = result.checks.find((c) => c.id === "api-catalog");
    expect(apiCatalog?.passed).toBe(false);
    expect(apiCatalog?.evidence).toContain("linkset");
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

describe("categoryScore", () => {
  function result(overrides: Partial<CheckResult>): CheckResult {
    return {
      id: "test-check",
      title: "Test check",
      category: "test",
      severityTier: "notice",
      passed: true,
      evidence: "",
      ...overrides,
    };
  }

  test("an always-failing inferred check does not cap a category that is otherwise perfect", async () => {
    const checks = [
      result({ passed: true }),
      result({ passed: false, inferred: true }),
    ];
    expect(categoryScore(checks)).toBe(100);
  });

  test("a category made only of inferred checks is not penalized (nothing verifiable to score)", async () => {
    const checks = [
      result({ passed: false, inferred: true }),
      result({ passed: false, inferred: true }),
    ];
    expect(categoryScore(checks)).toBe(100);
  });

  test("a real (non-inferred) failure still lowers the category score", async () => {
    const checks = [result({ passed: true }), result({ passed: false })];
    expect(categoryScore(checks)).toBe(50);
  });
});
