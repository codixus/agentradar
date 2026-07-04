import { expect, test } from "bun:test";
import { computeScore, runScan } from "./index.ts";

// Intercepts DNS-AID's DNS-over-HTTPS lookup so this test never makes a
// live call to cloudflare-dns.com, consistent with scan.test.ts.
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

test("public entry point re-exports a working runScan", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response("not found", { status: 404 }),
  });
  try {
    const result = await runScan(server.url.href, {
      fetchImpl: createNoNetworkFetch(),
    });
    expect(result.url).toBe(server.url.href);
    expect(result.checks.length).toBeGreaterThan(0);
  } finally {
    server.stop(true);
  }
});

test("public entry point re-exports computeScore", () => {
  expect(computeScore([]).grade).toBe("A");
});
