import { expect, test } from "bun:test";
import { main } from "./index.ts";

test("scan subcommand is a recognized but not-yet-implemented command", () => {
  const originalError = console.error;
  let logged = "";
  console.error = (msg: string) => {
    logged = msg;
  };
  const code = main(["scan"]);
  console.error = originalError;
  expect(code).toBe(1);
  expect(logged).toContain("scan");
});

test("no arguments prints a version line and exits 0", () => {
  const originalLog = console.log;
  let logged = "";
  console.log = (msg: string) => {
    logged = msg;
  };
  const code = main([]);
  console.log = originalLog;
  expect(code).toBe(0);
  expect(logged).toContain("agentsight");
});
