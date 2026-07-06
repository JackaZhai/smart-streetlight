import { describe, expect, test } from "vitest";
import appSource from "../App.vue?raw";
import sidebarSource from "./SidebarNav.vue?raw";
import packageJson from "../../package.json";

describe("frontend feature migration", () => {
  test("adds migrated frontend sections without importing the reference frontend stack", () => {
    expect(sidebarSource).toContain("区域管控");
    expect(sidebarSource).toContain("光照监测");
    expect(sidebarSource).toContain("历史趋势");
    expect(appSource).toContain(
      'type DashboardSection = "overview" | "gis" | "monitor" | "history" | "devices" | "alarms" | "rules" | "agent"'
    );
    expect(appSource).toContain('activeSection === "gis"');
    expect(appSource).toContain('activeSection === "monitor"');
    expect(appSource).toContain('activeSection === "history"');
    expect(Object.keys(packageJson.dependencies)).not.toEqual(
      expect.arrayContaining(["element-plus", "pinia", "vue-router", "leaflet"])
    );
  });

  test("wires migrated pages to existing API-backed state", () => {
    expect(appSource).toContain("regionMatchedDevices");
    expect(appSource).toContain("dispatchRegionCommand");
    expect(appSource).toContain("monitorLightPercent");
    expect(appSource).toContain("historySummary");
    expect(appSource).toContain("thresholdPreviewStatus");
    expect(appSource).toContain("persistRule");
    expect(appSource).toContain("光照阈值调试面板");
  });
});
