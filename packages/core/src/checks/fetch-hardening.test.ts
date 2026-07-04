import { afterEach, describe, expect, test } from "bun:test";
import type { CheckContext } from "../types.ts";
import { fetchRaw } from "./fetch-raw.ts";
import { fetchText } from "./fetch-text.ts";
import { MAX_BODY_BYTES, MAX_REDIRECTS, readCappedText } from "./http.ts";
import { markdownNegotiationCheck } from "./markdown-negotiation.ts";

let activeServer: ReturnType<typeof Bun.serve> | null = null;

// A single fixture whose routing lets one server exercise every redirect
// shape: an N-long redirect chain (/chain/<n> -> /chain/<n-1> -> ... -> 200),
// an infinite loop, a relative-Location hop, a Location-less 3xx, a bare 304,
// and a markdown page reachable only through a redirect.
function startFixtureServer() {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const p = new URL(req.url).pathname;
      if (p.startsWith("/chain/")) {
        const n = Number(p.slice("/chain/".length));
        if (!Number.isFinite(n) || n <= 0) {
          return new Response("arrived", { status: 200 });
        }
        // relative Location on purpose: also exercises relative resolution
        return new Response(null, {
          status: 302,
          headers: { location: `/chain/${n - 1}` },
        });
      }
      if (p === "/loop-a") {
        return new Response(null, {
          status: 302,
          headers: { location: "/loop-b" },
        });
      }
      if (p === "/loop-b") {
        return new Response(null, {
          status: 302,
          headers: { location: "/loop-a" },
        });
      }
      if (p === "/rel") {
        return new Response(null, {
          status: 302,
          headers: { location: "/rel-final" },
        });
      }
      if (p === "/rel-final")
        return new Response("rel arrived", { status: 200 });
      if (p === "/big") {
        // a body larger than the default MAX_BODY_BYTES cap
        return new Response("a".repeat(MAX_BODY_BYTES + 1000), { status: 200 });
      }
      if (p === "/no-location") return new Response(null, { status: 302 });
      if (p === "/not-modified") return new Response(null, { status: 304 });
      if (p === "/plain") return new Response("plain-ok", { status: 200 });
      if (p === "/md-redirect") {
        return new Response(null, {
          status: 302,
          headers: { location: "/md" },
        });
      }
      if (p === "/md") {
        return new Response("# md\n\nhi agent", {
          status: 200,
          headers: { "content-type": "text/markdown; charset=utf-8" },
        });
      }
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

function rawCtx(
  timeoutMs = 2000,
): Pick<CheckContext, "fetchImpl" | "timeoutMs"> {
  return { fetchImpl: fetch, timeoutMs };
}

function textCtx(
  baseUrl: string | URL,
  timeoutMs = 2000,
): Pick<CheckContext, "baseUrl" | "fetchImpl" | "timeoutMs"> {
  return { baseUrl: new URL(baseUrl), fetchImpl: fetch, timeoutMs };
}

describe("fetchRaw redirect cap (R1)", () => {
  test("happy path: a normal 200 with no redirect is returned intact", async () => {
    const server = startFixtureServer();
    const res = await fetchRaw(rawCtx(), new URL("/plain", server.url));
    expect(res?.status).toBe(200);
    expect(await res?.text()).toBe("plain-ok");
  });

  test("follows a chain within the cap to the final 200", async () => {
    const server = startFixtureServer();
    const res = await fetchRaw(rawCtx(), new URL("/chain/3", server.url));
    expect(res?.status).toBe(200);
    expect(await res?.text()).toBe("arrived");
  });

  test("follows exactly MAX_REDIRECTS redirects (boundary passes)", async () => {
    const server = startFixtureServer();
    const res = await fetchRaw(
      rawCtx(),
      new URL(`/chain/${MAX_REDIRECTS}`, server.url),
    );
    expect(res?.status).toBe(200);
  });

  test("one redirect past the cap returns null instead of following forever", async () => {
    const server = startFixtureServer();
    const res = await fetchRaw(
      rawCtx(),
      new URL(`/chain/${MAX_REDIRECTS + 1}`, server.url),
    );
    expect(res).toBeNull();
  });

  test("an infinite redirect loop is bounded by the cap, not hung", async () => {
    const server = startFixtureServer();
    const res = await fetchRaw(rawCtx(), new URL("/loop-a", server.url));
    expect(res).toBeNull();
  });

  test("a relative Location is resolved against the current hop", async () => {
    const server = startFixtureServer();
    const res = await fetchRaw(rawCtx(), new URL("/rel", server.url));
    expect(res?.status).toBe(200);
    expect(await res?.text()).toBe("rel arrived");
  });

  test("a 3xx with no Location header is returned as-is, not treated as a redirect", async () => {
    const server = startFixtureServer();
    const res = await fetchRaw(rawCtx(), new URL("/no-location", server.url));
    expect(res?.status).toBe(302);
  });

  test("a 304 Not Modified is not treated as a redirect", async () => {
    const server = startFixtureServer();
    const res = await fetchRaw(rawCtx(), new URL("/not-modified", server.url));
    expect(res?.status).toBe(304);
  });
});

describe("fetchText over the redirect cap (R1/R3)", () => {
  test("a body reachable within the cap is read", async () => {
    const server = startFixtureServer();
    const res = await fetchText(textCtx(server.url), "/plain");
    expect(res?.ok).toBe(true);
    expect(res?.body).toBe("plain-ok");
  });

  test("a target that redirects past the cap resolves to null, not a hang", async () => {
    const server = startFixtureServer();
    const res = await fetchText(
      textCtx(server.url),
      `/chain/${MAX_REDIRECTS + 1}`,
    );
    expect(res).toBeNull();
  });

  test("a body larger than the default cap is truncated to MAX_BODY_BYTES (the default is actually wired in, not just readCappedText)", async () => {
    const server = startFixtureServer();
    const res = await fetchText(textCtx(server.url), "/big");
    expect(res?.ok).toBe(true);
    expect(res?.body.length).toBe(MAX_BODY_BYTES);
  });
});

describe("readCappedText body-size cap (R2)", () => {
  test("a body under the cap is returned byte-for-byte", async () => {
    expect(await readCappedText(new Response("hello"), 100)).toBe("hello");
  });

  test("a body over the cap is truncated to exactly maxBytes", async () => {
    const text = await readCappedText(new Response("x".repeat(100)), 10);
    expect(text.length).toBe(10);
    expect(text).toBe("xxxxxxxxxx");
  });

  test("an oversized (effectively unbounded) stream is cancelled once the cap is hit, not fully drained", async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(1000)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const text = await readCappedText(new Response(stream), 100);
    expect(text.length).toBe(100);
    expect(cancelled).toBe(true);
  });
});

describe("markdown-negotiation through the shared primitive (R3)", () => {
  test("still detects text/markdown when it is only reachable via a redirect", async () => {
    const server = startFixtureServer();
    const ctx: CheckContext = {
      baseUrl: new URL("/md-redirect", server.url),
      fetchImpl: fetch,
      timeoutMs: 2000,
      robotsTxt: null,
    };
    const result = await markdownNegotiationCheck.run(ctx);
    expect(result.passed).toBe(true);
  });
});
