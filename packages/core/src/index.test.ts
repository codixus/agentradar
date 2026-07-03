import { expect, test } from "bun:test";
import { AGENTSIGHT_CORE_VERSION } from "./index.ts";

test("exports a version string", () => {
  expect(typeof AGENTSIGHT_CORE_VERSION).toBe("string");
});
