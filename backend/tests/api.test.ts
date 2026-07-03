import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("API route wiring", () => {
  it("wires fault prediction list and per-device endpoints", () => {
    const source = readFileSync(resolve("src/routes/api.ts"), "utf-8");

    expect(source).toContain("buildFaultPredictions");
    expect(source).toContain('router.get("/fault-predictions"');
    expect(source).toContain('router.get("/devices/:id/fault-predictions"');
    expect(source).toContain("parseDeviceIdParam");
  });
});
