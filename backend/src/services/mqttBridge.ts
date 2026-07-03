import mqtt, { type MqttClient } from "mqtt";
import type { Server } from "socket.io";
import {
  applyCommandReply,
  applyTelemetry,
  buildOverview,
  markControlCommandFailed,
  markOfflineDevices
} from "../domain/streetlight.js";
import type { CommandName, CommandReplyMessage, CommandSource, TelemetryMessage } from "../domain/types.js";
import type { StateStore } from "./store.js";

type MqttClientLike = Pick<MqttClient, "on" | "subscribe" | "publish" | "end">;

interface MqttBridgeOptions {
  mqttUrl: string;
  store: StateStore;
  io: Server;
  mqttClient?: MqttClientLike;
  retryDelayMs?: number;
  maxPublishAttempts?: number;
  offlineScanIntervalMs?: number;
}

export interface MqttBridge {
  publishCommand(
    commandId: string,
    deviceId: string,
    command: CommandName,
    source: CommandSource,
    reason?: string
  ): void;
  close(): Promise<void>;
}

interface PendingCommand {
  commandId: string;
  deviceId: string;
  command: CommandName;
  source: CommandSource;
  reason?: string;
  attempts: number;
  timer?: ReturnType<typeof setTimeout>;
}

export function createMqttBridge(options: MqttBridgeOptions): MqttBridge {
  const client =
    options.mqttClient ??
    mqtt.connect(options.mqttUrl, {
      reconnectPeriod: 3000,
      connectTimeout: 5000
    });
  const retryDelayMs = options.retryDelayMs ?? 3000;
  const maxPublishAttempts = options.maxPublishAttempts ?? 3;
  const pendingCommands = new Map<string, PendingCommand>();

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
        await handleTelemetry(options, publishCommandWithRetry, payload.toString());
      }
      if (topic.endsWith("/command/reply")) {
        await handleCommandReply(options, pendingCommands, payload.toString());
      }
    } catch (error) {
      console.warn("[mqtt] message handling failed", error);
    }
  });

  const offlineTimer =
    options.offlineScanIntervalMs === 0
      ? undefined
      : setInterval(async () => {
          await options.store.update((state) => markOfflineDevices(state));
          await emitOverview(options);
        }, options.offlineScanIntervalMs ?? 10_000);

  function publishCommandWithRetry(command: Omit<PendingCommand, "attempts" | "timer">): void {
    const pending: PendingCommand = {
      ...command,
      attempts: 0
    };
    pendingCommands.set(command.commandId, pending);
    publishAttempt(pending);
  }

  function publishAttempt(pending: PendingCommand): void {
    pending.attempts += 1;
    const payload = JSON.stringify({
      commandId: pending.commandId,
      deviceId: pending.deviceId,
      command: pending.command,
      source: pending.source,
      ...(pending.reason ? { reason: pending.reason } : {}),
      attempt: pending.attempts,
      maxAttempts: maxPublishAttempts,
      timestamp: new Date().toISOString()
    });
    client.publish(`streetlight/${pending.deviceId}/command`, payload);
    pending.timer = setTimeout(() => {
      void handleRetryTimeout(pending.commandId);
    }, retryDelayMs);
  }

  async function handleRetryTimeout(commandId: string): Promise<void> {
    const pending = pendingCommands.get(commandId);
    if (!pending) {
      return;
    }
    if (pending.attempts < maxPublishAttempts) {
      publishAttempt(pending);
      return;
    }
    pendingCommands.delete(commandId);
    await options.store.update((state) => markControlCommandFailed(state, commandId));
    await emitOverview(options);
  }

  return {
    publishCommand(commandId, deviceId, command, source, reason) {
      publishCommandWithRetry({
        commandId,
        deviceId,
        command,
        source,
        reason
      });
    },
    close() {
      if (offlineTimer) {
        clearInterval(offlineTimer);
      }
      for (const pending of pendingCommands.values()) {
        if (pending.timer) {
          clearTimeout(pending.timer);
        }
      }
      pendingCommands.clear();
      return new Promise((resolve) => client.end(false, {}, () => resolve()));
    }
  };
}

async function handleTelemetry(
  options: MqttBridgeOptions,
  publishCommand: (command: Omit<PendingCommand, "attempts" | "timer">) => void,
  payload: string
): Promise<void> {
  const telemetry = JSON.parse(payload) as TelemetryMessage;
  let queuedCommands: ReturnType<typeof applyTelemetry>["commands"] = [];
  await options.store.update((state) => {
    const next = applyTelemetry(state, telemetry);
    queuedCommands = next.commands;
    return next.state;
  });
  for (const command of queuedCommands) {
    publishCommand({
      commandId: command.commandId,
      deviceId: command.deviceId,
      command: command.command,
      source: command.source,
      reason: command.reason
    });
  }
  await emitOverview(options);
}

async function handleCommandReply(
  options: MqttBridgeOptions,
  pendingCommands: Map<string, PendingCommand>,
  payload: string
): Promise<void> {
  const reply = JSON.parse(payload) as CommandReplyMessage;
  clearPendingCommand(pendingCommands, reply);
  await options.store.update((state) => applyCommandReply(state, reply));
  await emitOverview(options);
}

function clearPendingCommand(pendingCommands: Map<string, PendingCommand>, reply: CommandReplyMessage): void {
  const pending = reply.commandId
    ? pendingCommands.get(reply.commandId)
    : Array.from(pendingCommands.values()).find(
        (item) => item.deviceId === reply.deviceId && item.command === reply.command
      );
  if (!pending) {
    return;
  }
  if (pending.timer) {
    clearTimeout(pending.timer);
  }
  pendingCommands.delete(pending.commandId);
}

async function emitOverview(options: MqttBridgeOptions): Promise<void> {
  const state = await options.store.getState();
  options.io.emit("state:update", buildOverview(state));
}
