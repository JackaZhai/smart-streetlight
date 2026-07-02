import { describe, expect, test } from "vitest";
import sidebarSource from "./SidebarNav.vue?raw";

describe("SidebarNav", () => {
  test("emits navigation events from sidebar nav buttons", () => {
    expect(sidebarSource).toContain("navigate:");
    expect(sidebarSource).toContain("@click=\"emit('navigate', item.key)\"");
    expect(sidebarSource).toContain("阈值规则");
  });
});
