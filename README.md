# AgentSight

AgentSight checks whether a site (and, for app builders, the underlying product) is visible and usable to AI agents: LLM crawlers, shopping/browsing agents, and MCP clients.

It is deliberately narrow. AgentSight does **not** check general site health, performance, or SEO — there are already good tools for that (Lighthouse, PageSpeed Insights, SSL Labs). Every check here answers one question: **can an AI agent discover, read, or use this?**

> Status: under active development, not yet published to npm.

## What it checks

Grouped by outcome, not by protocol name:

- **Can agents find your site** — robots.txt, sitemap, Link headers, DNS-based AI discovery
- **Can agents read your content** — markdown content negotiation, `llms.txt`, AI content-usage signals
- **Can agents reach your app** — deep-link association files (`apple-app-site-association`, `assetlinks.json`)
- **Can agents trust and transact with you** — bot authentication, OAuth/MCP/A2A discovery, agentic-commerce protocol support

Full check list and rationale land here as each batch ships.

## Usage

```sh
npx agentsight scan <url>
```

Add `--json` for machine-readable output.

## Development

Bun workspace with two packages:

- `packages/core` — the scan/rule engine (pure TypeScript, no framework dependencies)
- `packages/cli` — the `agentsight` command

```sh
bun install
bun run lint
bun run typecheck
bun test
```

## License

MIT
