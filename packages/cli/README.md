# agentradar

Check whether a site (and, for app builders, the underlying product) is visible and usable to AI agents: LLM crawlers, shopping/browsing agents, and MCP clients.

It is deliberately narrow. AgentRadar does **not** check general site health, performance, or SEO. Every check answers one question: **can an AI agent discover, read, or use this?**

## Usage

```sh
npx agentradar scan <url>
# or, with Bun:
bunx agentradar scan <url>
```

Add `--json` for machine-readable output:

```sh
npx agentradar scan example.com --json
```

## What it checks

20 checks grouped by outcome, not protocol name:

- **Can agents find your site** - robots.txt, AI bot rules, sitemap.xml, Link headers, DNS-AID
- **Can agents read your content** - markdown negotiation, llms.txt, Content Signals
- **Can agents reach your app** - `apple-app-site-association` / `assetlinks.json` deep-link association
- **Can agents trust and transact with you** - API Catalog, OAuth discovery + protected resource, Auth.md, MCP Server Card, A2A Agent Card, Agent Skills, UCP, x402, Web Bot Auth, MPP

The composite grade is affected only by error-tier checks; warning/notice checks are shown but never lower the score. Checks tagged `inferred` confirm only that a signal is published, not that it is enforced.

Full check reference and rationale: <https://github.com/codixus/agentradar#readme>.

## License

MIT
