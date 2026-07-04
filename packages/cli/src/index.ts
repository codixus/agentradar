#!/usr/bin/env bun
import type { CategoryResult, CheckResult, ScanResult } from "agentsight-core";
import { runScan } from "agentsight-core";

function printUsage(): void {
  console.log("agentsight - AI-agent visibility scanner");
  console.log("");
  console.log("Usage:");
  console.log("  agentsight scan <url> [--json]");
}

function categoryLabel(id: string): string {
  return id
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function printCheck(check: CheckResult): void {
  const mark = check.passed ? "PASS" : "FAIL";
  const inferredTag = check.inferred ? " [inferred]" : "";
  console.log(`  [${mark}]${inferredTag} ${check.title} - ${check.evidence}`);
  if (!check.passed && check.fixHint) {
    console.log(`         -> ${check.fixHint}`);
  }
}

function printCategory(category: CategoryResult): void {
  console.log(`${categoryLabel(category.category)} (${category.score}/100)`);
  for (const check of category.checks) {
    printCheck(check);
  }
  console.log("");
}

function printReport(result: ScanResult): void {
  console.log(`AgentSight scan: ${result.url}`);
  console.log(`Grade: ${result.grade} (${result.score}/100)`);
  console.log("");
  for (const category of result.categories) {
    printCategory(category);
  }
}

function parseTargetUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export interface MainOptions {
  fetchImpl?: typeof fetch;
}

async function runScanCommand(
  target: string,
  asJson: boolean,
  options: MainOptions,
): Promise<number> {
  const parsed = parseTargetUrl(target);
  if (!parsed) {
    console.error(
      `"${target}" is not a valid URL. Try: agentsight scan https://example.com`,
    );
    return 1;
  }

  let result: ScanResult;
  try {
    result = await runScan(parsed.href, { fetchImpl: options.fetchImpl });
  } catch (err) {
    console.error(
      `Scan failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printReport(result);
  }
  return 0;
}

export async function main(
  argv: string[],
  options: MainOptions = {},
): Promise<number> {
  const [command, target] = argv;

  if (!command) {
    printUsage();
    return 0;
  }

  if (command === "scan") {
    if (!target) {
      console.error("Usage: agentsight scan <url>");
      return 1;
    }
    return runScanCommand(target, argv.includes("--json"), options);
  }

  console.error(`Unknown command: ${command}`);
  printUsage();
  return 1;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
