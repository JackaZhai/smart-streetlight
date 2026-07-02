import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
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

      const state = await store.getState();
      expect(state.devices[0].location).toBe("MySQL 持久化测试点位");
      expect(state.alarms[0]).toMatchObject({
        handled: true,
        handledBy: "operator",
        handledAt: "2026-07-02T09:30:00.000Z",
        handleRemark: "MySQL 告警处理备注"
      });
    } finally {
      await store.dropSchema();
      await store.close();
    }
  });
});
