import { describe, expect, it } from "vitest";
import {
  applyManualCommand,
  applyTelemetry,
  buildOverview,
  createSeedState,
  handleAlarm,
  markOfflineDevices,
  updateThreshold
} from "../src/domain/streetlight.js";

describe("streetlight domain", () => {
  it("records telemetry and queues automatic turn-on when light is below threshold", () => {
    const state = createSeedState("2026-07-01T08:00:00.000Z");
    const initial = applyManualCommand(state, "SL-002", "TURN_OFF", "manual", "2026-07-01T08:00:01.000Z");

    const result = applyTelemetry(initial, {
      deviceId: "SL-002",
      lightIntensity: 50,
      lampStatus: "OFF",
      online: true,
      timestamp: "2026-07-01T08:01:00.000Z"
    });

    expect(result.commands).toEqual([
      {
        deviceId: "SL-002",
        command: "TURN_ON",
        source: "auto",
        reason: "光照低于开灯阈值"
      }
    ]);
    expect(result.state.devices.find((device) => device.id === "SL-002")?.lampStatus).toBe("ON");
    expect(result.state.readings.at(-1)).toMatchObject({
      deviceId: "SL-002",
      lightIntensity: 50,
      lampStatus: "OFF"
    });
  });

  it("marks online devices offline and creates one active offline alarm after heartbeat timeout", () => {
    const state = createSeedState("2026-07-01T08:00:00.000Z");

    const firstPass = markOfflineDevices(state, "2026-07-01T08:01:00.000Z", 20_000);
    const secondPass = markOfflineDevices(firstPass, "2026-07-01T08:02:00.000Z", 20_000);

    expect(secondPass.devices.every((device) => device.onlineStatus === "OFFLINE")).toBe(true);
    const offlineAlarms = secondPass.alarms.filter((alarm) => alarm.alarmType === "DEVICE_OFFLINE" && !alarm.handled);
    expect(offlineAlarms).toHaveLength(4);
  });

  it("updates thresholds and builds overview statistics from latest readings", () => {
    const state = createSeedState("2026-07-01T08:00:00.000Z");
    const updated = updateThreshold(state, "SL-001", {
      lowThreshold: 90,
      highThreshold: 280,
      enabled: false
    });
    const overview = buildOverview(updated);

    expect(updated.thresholds.find((threshold) => threshold.deviceId === "SL-001")).toMatchObject({
      lowThreshold: 90,
      highThreshold: 280,
      enabled: false
    });
    expect(overview.stats.deviceTotal).toBe(4);
    expect(overview.stats.onlineDevices).toBe(4);
    expect(overview.latestReadings.length).toBe(4);
  });

  it("records operator metadata when handling alarms", () => {
    const state = createSeedState("2026-07-01T08:00:00.000Z");
    const alarmId = state.alarms[0]?.id ?? "";

    const handled = handleAlarm(
      state,
      alarmId,
      { username: "operator", role: "operator" },
      {
        handledAt: "2026-07-01T08:30:00.000Z",
        remark: "已通知现场人员检查传感器遮挡。"
      }
    );

    expect(handled.alarms[0]).toMatchObject({
      id: alarmId,
      handled: true,
      handledBy: "operator",
      handledAt: "2026-07-01T08:30:00.000Z",
      handleRemark: "已通知现场人员检查传感器遮挡。"
    });
  });

  it("generates unique reading identifiers for seeded and incoming telemetry", () => {
    const state = createSeedState("2026-07-01T08:00:00.000Z");
    const seededReadingIds = state.readings.map((reading) => reading.id);
    expect(new Set(seededReadingIds).size).toBe(seededReadingIds.length);

    const first = applyTelemetry(state, {
      deviceId: "SL-001",
      lightIntensity: 70,
      lampStatus: "OFF",
      online: true,
      timestamp: "2026-07-01T08:01:00.000Z"
    }).state;
    const second = applyTelemetry(first, {
      deviceId: "SL-001",
      lightIntensity: 75,
      lampStatus: "OFF",
      online: true,
      timestamp: "2026-07-01T08:02:00.000Z"
    }).state;

    const readingIds = second.readings.map((reading) => reading.id);
    expect(new Set(readingIds).size).toBe(readingIds.length);
  });
});
