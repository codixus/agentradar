import { expect, test } from "bun:test";
import { computeScore, runScan } from "./index.ts";

test("public entry point re-exports a working runScan", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response("not found", { status: 404 }),
  });
  try {
    const result = await runScan(server.url.href);
    expect(result.url).toBe(server.url.href);
    expect(result.checks.length).toBeGreaterThan(0);
  } finally {
    server.stop(true);
  }
});

test("public entry point re-exports computeScore", () => {
  expect(computeScore([]).grade).toBe("A");
});
