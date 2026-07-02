import { describe, expect, test } from "vitest";
import appSource from "../App.vue?raw";
import apiSource from "../services/api.ts?raw";

describe("add device flow", () => {
  test("wires the add-device action to an API-backed form", () => {
    expect(apiSource).toContain("createDevice");
    expect(appSource).toContain("submitCreateDevice");
    expect(appSource).toContain("@submit.prevent=\"submitCreateDevice\"");
    expect(appSource).toContain("@click=\"showCreateDevice = true\"");
  });
});
