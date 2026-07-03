# AgentSight

AgentSight checks whether a site (and, for app builders, the underlying product) is visible and usable to AI agents: LLM crawlers, shopping/browsing agents, and MCP clients.

It is deliberately narrow. AgentSight does **not** check general site health, performance, or SEO - there are already good tools for that (Lighthouse, PageSpeed Insights, SSL Labs). Every check here answers one question: **can an AI agent discover, read, or use this?**

> Status: under active development, not yet published to npm.

## Usage

```sh
npx agentsight scan <url>
```

Add `--json` for machine-readable output.

## What it checks

20 checks, grouped by outcome rather than protocol name. The composite score/grade is affected only by "error"-tier checks; "warning" and "notice" checks are shown but never lower the score, since several of these signals are only weeks old at the time of writing.

### Can agents find your site

| Check | What it looks for |
|---|---|
| robots.txt | A parseable robots.txt at the site root (RFC 9309) |
| AI bot rules | Explicit `User-agent` rules for a known AI crawler (GPTBot, ClaudeBot, PerplexityBot, and others) |
| sitemap.xml | A valid sitemap at the site root |
| Link headers | A `Link` response header pointing agents at further resources (RFC 8288) |
| DNS for AI Discovery (DNS-AID) | An SVCB record at `_index._agents.<domain>` (draft-mozleywilliams-dnsop-dnsaid) |

### Can agents read your content

| Check | What it looks for |
|---|---|
| Markdown negotiation | Serving `text/markdown` when the request's `Accept` header prefers it |
| llms.txt | A valid `llms.txt` file (llmstxt.org) |
| Content Signals | A `Content-Signal` line in robots.txt declaring AI usage preferences |

### Can agents reach your app

| Check | What it looks for |
|---|---|
| App deep-link association | A valid `apple-app-site-association` and/or `assetlinks.json`, so an AI shopping/browsing agent can deep-link into your app |

### Can agents trust and transact with you

| Check | What it looks for |
|---|---|
| API Catalog | An RFC 9727 catalog at `/.well-known/api-catalog` |
| OAuth discovery | RFC 8414 authorization server metadata |
| OAuth Protected Resource | RFC 9728 protected resource metadata |
| Auth.md | A self-service OAuth registration guide (WorkOS's Auth.md protocol) |
| MCP Server Card | An MCP server card (SEP-2127, Draft) |
| A2A Agent Card | An Agent2Agent protocol agent card |
| Agent Skills | A web-discoverable agent skills index |
| Universal Commerce Protocol (UCP) | A UCP capability manifest |
| x402 | A 402 payment challenge at the site root (only the root is probed, not the full API surface) |
| Web Bot Auth *(inferred)* | A signing-key directory (existence only; incoming-request enforcement cannot be verified passively) |
| Machine Payments Protocol (MPP) *(inferred)* | Always reports inconclusive: MPP has no public discovery mechanism as of this writing |

Checks marked *(inferred)* confirm only that a signal is published, not that the site actually enforces or fully implements the underlying protocol.

## What it deliberately does not check

- Generic site health, performance, or accessibility (use Lighthouse or PageSpeed Insights)
- Generic on-page SEO or structured data (use Google's Rich Results Test)
- Generic TLS/security headers (use SSL Labs or Mozilla's HTTP Observatory)
- WebMCP support (no static manifest exists; detecting it requires a headless browser, out of scope for this scanner)
- ACP, the OpenAI/Stripe agentic commerce protocol (no merchant-side discovery signal exists to probe)

## Development

Bun workspace with two packages:

- `packages/core` - the scan/rule engine (pure TypeScript, no framework dependencies)
- `packages/cli` - the `agentsight` command

```sh
bun install
bun run lint
bun run typecheck
bun test
```

## License

MIT
