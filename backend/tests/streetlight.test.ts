import { describe, expect, it } from "vitest";
import {
  applyManualCommand,
  applyCommandReply,
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
        commandId: expect.any(String),
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

  it("queues automatic turn-off when light is above threshold", () => {
    const state = createSeedState("2026-07-01T08:00:00.000Z");
    const initial = applyManualCommand(state, "SL-001", "TURN_ON", "manual", "2026-07-01T08:00:01.000Z");

    const result = applyTelemetry(initial, {
      deviceId: "SL-001",
      lightIntensity: 380,
      lampStatus: "ON",
      online: true,
      timestamp: "2026-07-01T08:01:00.000Z"
    });

    expect(result.commands).toEqual([
      {
        commandId: expect.any(String),
        deviceId: "SL-001",
        command: "TURN_OFF",
        source: "auto",
        reason: "光照高于关灯阈值"
      }
    ]);
    expect(result.state.devices.find((device) => device.id === "SL-001")?.lampStatus).toBe("OFF");
    expect(result.state.controlLogs[0]).toMatchObject({
      deviceId: "SL-001",
      command: "TURN_OFF",
      source: "auto",
      result: "QUEUED"
    });
  });

  it("records manual light commands and updates device lamp status", () => {
    const state = createSeedState("2026-07-01T08:00:00.000Z");

    const turnedOff = applyManualCommand(state, "SL-001", "TURN_OFF", "manual", "2026-07-01T08:05:00.000Z");
    const turnedOn = applyManualCommand(turnedOff, "SL-001", "TURN_ON", "manual", "2026-07-01T08:06:00.000Z");

    expect(turnedOff.devices.find((device) => device.id === "SL-001")?.lampStatus).toBe("OFF");
    expect(turnedOn.devices.find((device) => device.id === "SL-001")?.lampStatus).toBe("ON");
    expect(turnedOn.controlLogs.slice(0, 2)).toEqual([
      expect.objectContaining({
        deviceId: "SL-001",
        command: "TURN_ON",
        source: "manual",
        result: "QUEUED",
        createdAt: "2026-07-01T08:06:00.000Z"
      }),
      expect.objectContaining({
        deviceId: "SL-001",
        command: "TURN_OFF",
        source: "manual",
        result: "QUEUED",
        createdAt: "2026-07-01T08:05:00.000Z"
      })
    ]);
  });

  it("updates queued control log result from command reply", () => {
    const state = createSeedState("2026-07-01T08:00:00.000Z");
    const queued = applyManualCommand(state, "SL-001", "TURN_ON", "manual", "2026-07-01T08:05:00.000Z");
    const commandId = queued.controlLogs[0].id;

    const acknowledged = applyCommandReply(queued, {
      commandId,
      deviceId: "SL-001",
      command: "TURN_ON",
      result: "SUCCESS",
      timestamp: "2026-07-01T08:05:01.000Z"
    });

    expect(acknowledged.controlLogs[0]).toMatchObject({
      id: commandId,
      result: "SUCCESS"
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
