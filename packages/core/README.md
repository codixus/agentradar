# agentradar-core

The AI-agent-visibility scan engine behind the [`agentradar`](https://www.npmjs.com/package/agentradar) CLI. Runs the checks, scores them, and returns structured results — no CLI, no framework.

**Bun-native:** this package ships TypeScript source (no build step). It is meant to be consumed by a Bun runtime (e.g. `agentradar`'s CLI and the codixus web scan endpoint), which executes `.ts` directly and reads types from source. It is not a compiled package for plain Node.

## Usage

```ts
import { runScan } from "agentradar-core";

const result = await runScan("https://example.com", { timeoutMs: 8000 });
console.log(result.grade, result.score);
for (const check of result.checks) {
  console.log(check.id, check.passed, check.evidence);
}
```

`runScan(url, options?)` returns a `ScanResult` (`{ url, score, grade, checks, categories }`). Pass `fetchImpl` in `options` to inject a fetch (used in tests) and `timeoutMs` to bound each request.

**Trust model:** every outbound request is bounded by a timeout, a redirect cap, and a response-size cap, but the engine treats its input URL as trusted (curl-equivalent). A web caller that accepts attacker-supplied URLs must add its own SSRF / private-IP filtering before calling `runScan`.

## License

MIT
