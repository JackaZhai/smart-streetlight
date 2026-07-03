import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyManualCommand, createSeedState } from "../src/domain/streetlight.js";
import type { AppState } from "../src/domain/types.js";
import { createMqttBridge } from "../src/services/mqttBridge.js";
import type { StateStore, StateUpdater } from "../src/services/store.js";

class MemoryStore implements StateStore {
  readonly driver = "memory";

  constructor(private state: AppState) {}

  async getState(): Promise<AppState> {
    return this.state;
  }

  async update(updater: StateUpdater): Promise<AppState> {
    this.state = await updater(this.state);
    return this.state;
  }
}

class FakeMqttClient extends EventEmitter {
  readonly published: Array<{ topic: string; payload: string }> = [];

  subscribe(_topics: string[], callback: (error?: Error) => void): void {
    callback();
  }

  publish(topic: string, payload: string): void {
    this.published.push({ topic, payload });
  }

  end(_force: boolean, _options: object, callback: () => void): void {
    callback();
  }
}

const io = {
  emit: vi.fn()
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("MqttBridge command acknowledgement and retry", () => {
  it("marks a queued control log successful when command reply arrives", async () => {
    vi.useFakeTimers();
    const initial = applyManualCommand(
      createSeedState("2026-07-03T03:00:00.000Z"),
      "SL-001",
      "TURN_ON",
      "manual",
      "2026-07-03T03:01:00.000Z"
    );
    const commandId = initial.controlLogs[0].id;
    const store = new MemoryStore(initial);
    const client = new FakeMqttClient();
    const bridge = createMqttBridge({
      mqttUrl: "mqtt://test",
      store,
      io,
      mqttClient: client,
      retryDelayMs: 100,
      maxPublishAttempts: 3,
      offlineScanIntervalMs: 0
    });

    bridge.publishCommand(commandId, "SL-001", "TURN_ON", "manual");
    client.emit(
      "message",
      "streetlight/SL-001/command/reply",
      Buffer.from(
        JSON.stringify({
          commandId,
          deviceId: "SL-001",
          command: "TURN_ON",
          result: "SUCCESS",
          timestamp: "2026-07-03T03:01:01.000Z"
        })
      )
    );
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(300);

    const state = await store.getState();
    expect(client.published).toHaveLength(1);
    expect(state.controlLogs[0]).toMatchObject({
      id: commandId,
      result: "SUCCESS"
    });
    await bridge.close();
  });

  it("retries missing command replies and marks the control log failed after max attempts", async () => {
    vi.useFakeTimers();
    const initial = applyManualCommand(
      createSeedState("2026-07-03T03:00:00.000Z"),
      "SL-002",
      "TURN_OFF",
      "manual",
      "2026-07-03T03:02:00.000Z"
    );
    const commandId = initial.controlLogs[0].id;
    const store = new MemoryStore(initial);
    const client = new FakeMqttClient();
    const bridge = createMqttBridge({
      mqttUrl: "mqtt://test",
      store,
      io,
      mqttClient: client,
      retryDelayMs: 100,
      maxPublishAttempts: 3,
      offlineScanIntervalMs: 0
    });

    bridge.publishCommand(commandId, "SL-002", "TURN_OFF", "manual");
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    const state = await store.getState();
    expect(client.published).toHaveLength(3);
    expect(JSON.parse(client.published[0].payload)).toMatchObject({
      commandId,
      deviceId: "SL-002",
      command: "TURN_OFF",
      source: "manual",
      attempt: 1,
      maxAttempts: 3
    });
    expect(JSON.parse(client.published[2].payload)).toMatchObject({
      commandId,
      attempt: 3,
      maxAttempts: 3
    });
    expect(state.controlLogs[0]).toMatchObject({
      id: commandId,
      result: "FAILED"
    });
    await bridge.close();
  });
});
