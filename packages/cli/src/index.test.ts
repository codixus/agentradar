import { afterEach, describe, expect, test } from "bun:test";
import { main } from "./index.ts";

function captureConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (msg: unknown) => {
    logs.push(String(msg));
  };
  console.error = (msg: unknown) => {
    errors.push(String(msg));
  };
  return {
    logs,
    errors,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

let activeServer: ReturnType<typeof Bun.serve> | null = null;

afterEach(() => {
  activeServer?.stop(true);
  activeServer = null;
});

// Intercepts DNS-AID's DNS-over-HTTPS lookup so these tests never make a
// live call to cloudflare-dns.com, consistent with agentradar-core's own
// test suite.
function createNoNetworkFetch(): typeof fetch {
  return (async (...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    const url =
      input instanceof URL
        ? input.href
        : typeof input === "string"
          ? input
          : input.url;
    if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return fetch(input, init);
  }) as typeof fetch;
}

function startAgentReadyFixture() {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/") {
        const accept = req.headers.get("accept") ?? "";
        if (accept.includes("text/markdown")) {
          return new Response("# Example", {
            headers: { "content-type": "text/markdown" },
          });
        }
        return new Response("<html></html>", {
          headers: { "content-type": "text/html" },
        });
      }
      if (url.pathname === "/robots.txt") {
        return new Response(
          "User-agent: *\nDisallow:\nContent-Signal: search=yes\n",
        );
      }
      if (url.pathname === "/sitemap.xml") {
        return new Response(
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
        );
      }
      if (url.pathname === "/llms.txt") {
        return new Response("# Example\n");
      }
      return new Response("not found", { status: 404 });
    },
  });
  activeServer = server;
  return server;
}

describe("agentradar CLI", () => {
  test("no arguments prints usage and exits 0", async () => {
    const console_ = captureConsole();
    const code = await main([]);
    console_.restore();
    expect(code).toBe(0);
    expect(console_.logs.join("\n")).toContain("agentradar");
  });

  test("scan with no url prints a usage error and exits 1", async () => {
    const console_ = captureConsole();
    const code = await main(["scan"]);
    console_.restore();
    expect(code).toBe(1);
    expect(console_.errors.join("\n")).toContain(
      "Usage: agentradar scan <url>",
    );
  });

  test("scan with an invalid url reports a clean error, not a crash", async () => {
    const console_ = captureConsole();
    const code = await main(["scan", "not-a-url"]);
    console_.restore();
    expect(code).toBe(1);
    expect(console_.errors.join("\n")).toContain("not a valid URL");
  });

  test("scan with an unknown command prints usage and exits 1", async () => {
    const console_ = captureConsole();
    const code = await main(["frobnicate"]);
    console_.restore();
    expect(code).toBe(1);
    expect(console_.errors.join("\n")).toContain("Unknown command");
  });

  test("scan against a real target prints a human-readable report with a grade", async () => {
    const server = startAgentReadyFixture();
    const console_ = captureConsole();
    const code = await main(["scan", server.url.href], {
      fetchImpl: createNoNetworkFetch(),
    });
    console_.restore();
    expect(code).toBe(0);
    const output = console_.logs.join("\n");
    expect(output).toContain("Grade:");
    expect(output).toContain(server.url.href);
  });

  test("scan --json prints valid, parseable JSON matching the ScanResult shape", async () => {
    const server = startAgentReadyFixture();
    const console_ = captureConsole();
    const code = await main(["scan", server.url.href, "--json"], {
      fetchImpl: createNoNetworkFetch(),
    });
    console_.restore();
    expect(code).toBe(0);
    const parsed = JSON.parse(console_.logs.join("\n"));
    expect(parsed.url).toBe(server.url.href);
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(typeof parsed.score).toBe("number");
  });

  test("scan --json carries the audit-trail fields (goal, resources, transcript) verbatim", async () => {
    const server = startAgentReadyFixture();
    const console_ = captureConsole();
    const code = await main(["scan", server.url.href, "--json"], {
      fetchImpl: createNoNetworkFetch(),
    });
    console_.restore();
    expect(code).toBe(0);
    const parsed = JSON.parse(console_.logs.join("\n"));
    // goal + resources are on every check (copied from the meta).
    for (const check of parsed.checks) {
      expect(typeof check.goal).toBe("string");
      expect(Array.isArray(check.resources)).toBe(true);
    }
    // at least one check actually probed the target and recorded a transcript.
    const withTranscript = parsed.checks.filter(
      (c: { transcript?: unknown[] }) => (c.transcript?.length ?? 0) > 0,
    );
    expect(withTranscript.length).toBeGreaterThan(0);
  });

  test("human report shows the real evidence fetched from the target, not a generic description", async () => {
    const server = startAgentReadyFixture();
    const console_ = captureConsole();
    const code = await main(["scan", server.url.href], {
      fetchImpl: createNoNetworkFetch(),
    });
    console_.restore();
    expect(code).toBe(0);
    const output = console_.logs.join("\n");
    // the actual Content-Signal line the fixture served, not a paraphrase of it
    expect(output).toContain("Content-Signal: search=yes");
  });

  test("scan with a non-http(s) URL reports a clean error, not a crash", async () => {
    const console_ = captureConsole();
    const code = await main(["scan", "file:///etc/passwd"]);
    console_.restore();
    expect(code).toBe(1);
    expect(console_.errors.join("\n")).toContain("Scan failed");
  });
});
