import mqtt, { type MqttClient } from "mqtt";
import type { Server } from "socket.io";
import { applyTelemetry, buildOverview, markOfflineDevices } from "../domain/streetlight.js";
import type { CommandName, TelemetryMessage } from "../domain/types.js";
import type { StateStore } from "./store.js";

interface MqttBridgeOptions {
  mqttUrl: string;
  store: StateStore;
  io: Server;
}

export interface MqttBridge {
  publishCommand(deviceId: string, command: CommandName, source: "manual" | "auto"): void;
  close(): Promise<void>;
}

export function createMqttBridge(options: MqttBridgeOptions): MqttBridge {
  const client = mqtt.connect(options.mqttUrl, {
    reconnectPeriod: 3000,
    connectTimeout: 5000
  });

  client.on("connect", () => {
    console.log(`[mqtt] connected ${options.mqttUrl}`);
    client.subscribe(["streetlight/+/telemetry", "streetlight/+/command/reply"], (error) => {
      if (error) {
        console.warn("[mqtt] subscribe failed", error.message);
      }
    });
  });

  client.on("error", (error) => {
    console.warn("[mqtt] error", error.message);
  });

  client.on("message", async (topic, payload) => {
    try {
      if (topic.endsWith("/telemetry")) {
        await handleTelemetry(options, client, payload.toString());
      }
      if (topic.endsWith("/command/reply")) {
        await emitOverview(options);
      }
    } catch (error) {
      console.warn("[mqtt] message handling failed", error);
    }
  });

  const offlineTimer = setInterval(async () => {
    await options.store.update((state) => markOfflineDevices(state));
    await emitOverview(options);
  }, 10_000);

  return {
    publishCommand(deviceId, command, source) {
      const payload = JSON.stringify({
        deviceId,
        command,
        source,
        timestamp: new Date().toISOString()
      });
      client.publish(`streetlight/${deviceId}/command`, payload);
    },
    close() {
      clearInterval(offlineTimer);
      return new Promise((resolve) => client.end(false, {}, () => resolve()));
    }
  };
}

async function handleTelemetry(options: MqttBridgeOptions, client: MqttClient, payload: string): Promise<void> {
  const telemetry = JSON.parse(payload) as TelemetryMessage;
  let queuedCommands: ReturnType<typeof applyTelemetry>["commands"] = [];
  await options.store.update((state) => {
    const next = applyTelemetry(state, telemetry);
    queuedCommands = next.commands;
    return next.state;
  });
  for (const command of queuedCommands) {
    client.publish(
      `streetlight/${command.deviceId}/command`,
      JSON.stringify({
        deviceId: command.deviceId,
        command: command.command,
        source: command.source,
        reason: command.reason,
        timestamp: new Date().toISOString()
      })
    );
  }
  await emitOverview(options);
}

async function emitOverview(options: MqttBridgeOptions): Promise<void> {
  const state = await options.store.getState();
  options.io.emit("state:update", buildOverview(state));
}
