import { describe, expect, it } from "vitest";
import { appendAuditLog, createSeedState } from "../src/domain/streetlight.js";

describe("audit log domain behavior", () => {
  it("prepends immutable audit records with actor, action, target and result", () => {
    const state = createSeedState("2026-07-02T00:00:00.000Z");

    const next = appendAuditLog(
      state,
      {
        actor: { username: "viewer", role: "viewer" },
        action: "device.create",
        targetType: "device",
        targetId: "SL-999",
        result: "DENIED",
        detail: "viewer cannot create devices"
      },
      "2026-07-02T01:00:00.000Z"
    );

    expect(state.auditLogs).toEqual([]);
    expect(next.auditLogs[0]).toMatchObject({
      actorUsername: "viewer",
      actorRole: "viewer",
      action: "device.create",
      targetType: "device",
      targetId: "SL-999",
      result: "DENIED",
      detail: "viewer cannot create devices",
      createdAt: "2026-07-02T01:00:00.000Z"
    });
    expect(next.auditLogs[0].id).toMatch(/^audit-/);
  });

  it("keeps only the latest 500 audit records", () => {
    const state = createSeedState("2026-07-02T00:00:00.000Z");

    let next = state;
    for (let index = 0; index < 505; index += 1) {
      next = appendAuditLog(
        next,
        {
          actor: { username: "admin", role: "admin" },
          action: "threshold.update",
          targetType: "device",
          targetId: `SL-${index}`,
          result: "SUCCESS"
        },
        new Date(Date.UTC(2026, 6, 2, 1, 0, index)).toISOString()
      );
    }

    expect(next.auditLogs).toHaveLength(500);
    expect(next.auditLogs[0].targetId).toBe("SL-504");
    expect(next.auditLogs.at(-1)?.targetId).toBe("SL-5");
  });
});
