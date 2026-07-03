import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { applyTelemetry } from "../src/domain/streetlight.js";
import { MysqlStateStore } from "../src/services/mysqlStore.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run("MysqlStateStore", () => {
  it("initializes schema, seeds state, and persists updates", async () => {
    const store = new MysqlStateStore({
      databaseUrl: databaseUrl!,
      tablePrefix: `test_${randomUUID().replaceAll("-", "_")}_`
    });

    try {
      await store.init();
      const seeded = await store.getState();
      expect(seeded.devices).toHaveLength(4);

      await store.update((state) => {
        state.devices[0].location = "MySQL 持久化测试点位";
        state.alarms[0].handled = true;
        state.alarms[0].handledBy = "operator";
        state.alarms[0].handledAt = "2026-07-02T09:30:00.000Z";
        state.alarms[0].handleRemark = "MySQL 告警处理备注";
        return state;
      });

      await store.update((state) =>
        applyTelemetry(state, {
          deviceId: "SL-001",
          lightIntensity: 92,
          lampStatus: "OFF",
          online: true,
          timestamp: "2026-07-03T02:10:00.000Z"
        }).state
      );

      const state = await store.getState();
      const persistedReading = state.readings.find(
        (reading) => reading.deviceId === "SL-001" && reading.reportedAt === "2026-07-03T02:10:00.000Z"
      );
      expect(state.devices[0].location).toBe("MySQL 持久化测试点位");
      expect(state.alarms[0]).toMatchObject({
        handled: true,
        handledBy: "operator",
        handledAt: "2026-07-02T09:30:00.000Z",
        handleRemark: "MySQL 告警处理备注"
      });
      expect(persistedReading).toMatchObject({
        deviceId: "SL-001",
        lightIntensity: 92,
        lampStatus: "OFF",
        reportedAt: "2026-07-03T02:10:00.000Z"
      });
    } finally {
      await store.dropSchema();
      await store.close();
    }
  });
});
