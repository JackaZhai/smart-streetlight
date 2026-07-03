import { describe, expect, test } from "vitest";
import loginPanelSource from "./LoginPanel.vue?raw";

describe("LoginPanel", () => {
  test("guards submit state and exposes demo login guidance", () => {
    expect(loginPanelSource).toContain("const canSubmit = computed");
    expect(loginPanelSource).toContain("form.password.trim()");
    expect(loginPanelSource).toContain(":disabled=\"!canSubmit\"");
    expect(loginPanelSource).toContain("aria-live=\"polite\"");
    expect(loginPanelSource).toContain("默认管理员：admin / admin123");
  });
});
