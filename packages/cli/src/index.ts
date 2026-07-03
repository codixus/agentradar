#!/usr/bin/env bun
import { AGENTSIGHT_CORE_VERSION } from "agentsight-core";

export function main(argv: string[]): number {
  if (argv[0] === "scan") {
    console.error("agentsight scan is not implemented yet.");
    return 1;
  }
  console.log(`agentsight (core ${AGENTSIGHT_CORE_VERSION})`);
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
