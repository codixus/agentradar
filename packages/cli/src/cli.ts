#!/usr/bin/env node
// Executable bin entry. Kept separate from index.ts (the importable module) so
// the published bundle carries a node shebang and never depends on Bun-only
// entry detection like import.meta.main.
import { main } from "./index.ts";

process.exit(await main(process.argv.slice(2)));
