import { describe, expect, test } from "vitest";
import appSource from "../App.vue?raw";
import apiSource from "../services/api.ts?raw";

describe("region batch command flow", () => {
  test("wires region batch command API and controls into the rules page", () => {
    expect(apiSource).toContain("RegionCommandPayload");
    expect(apiSource).toContain("sendRegionCommand");
    expect(apiSource).toContain('"/api/regions/commands"');
    expect(appSource).toContain("区域批量控灯");
    expect(appSource).toContain("regionCommandForm");
    expect(appSource).toContain("dispatchRegionCommand");
    expect(appSource).toContain("逐台通过 MQTT 下发并等待回执");
  });
});
