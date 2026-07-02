import { Router } from "express";
import type { Server } from "socket.io";
import {
  applyManualCommand,
  buildOverview,
  handleAlarm,
  updateThreshold
} from "../domain/streetlight.js";
import type { CommandName } from "../domain/types.js";
import { answerQuestion } from "../services/agent.js";
import type { MqttBridge } from "../services/mqttBridge.js";
import type { StateStore } from "../services/store.js";

interface ApiOptions {
  store: StateStore;
  io: Server;
  mqttBridge: MqttBridge;
}

export function createApiRouter(options: ApiOptions): Router {
  const router = Router();

  router.get("/overview", async (_req, res) => {
    const state = await options.store.getState();
    res.json(buildOverview(state));
  });

  router.get("/devices", async (_req, res) => {
    const state = await options.store.getState();
    res.json(state.devices);
  });

  router.get("/devices/:id", async (req, res) => {
    const state = await options.store.getState();
    const device = state.devices.find((item) => item.id === req.params.id);
    if (!device) {
      res.status(404).json({ message: "设备不存在" });
      return;
    }
    res.json({
      device,
      threshold: state.thresholds.find((item) => item.deviceId === req.params.id),
      latestReading: state.readings.filter((item) => item.deviceId === req.params.id).at(-1),
      alarms: state.alarms.filter((item) => item.deviceId === req.params.id),
      controlLogs: state.controlLogs.filter((item) => item.deviceId === req.params.id)
    });
  });

  router.post("/devices", async (req, res) => {
    const nowIso = new Date().toISOString();
    const state = await options.store.update((current) => {
      if (current.devices.some((item) => item.id === req.body.id)) {
        return current;
      }
      current.devices.push({
        id: String(req.body.id),
        name: String(req.body.name ?? req.body.id),
        location: String(req.body.location ?? "未绑定点位"),
        onlineStatus: "OFFLINE",
        lampStatus: "OFF",
        autoMode: true,
        lastHeartbeatAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso
      });
      current.thresholds.push({
        deviceId: String(req.body.id),
        lowThreshold: 120,
        highThreshold: 320,
        enabled: true,
        updatedAt: nowIso
      });
      return current;
    });
    await emit(options, state);
    res.status(201).json(buildOverview(state));
  });

  router.get("/devices/:id/latest-light", async (req, res) => {
    const state = await options.store.getState();
    const latest = state.readings.filter((item) => item.deviceId === req.params.id).at(-1);
    res.json(latest ?? null);
  });

  router.get("/devices/:id/light-history", async (req, res) => {
    const state = await options.store.getState();
    res.json(state.readings.filter((item) => item.deviceId === req.params.id).slice(-80));
  });

  router.get("/devices/:id/threshold", async (req, res) => {
    const state = await options.store.getState();
    res.json(state.thresholds.find((item) => item.deviceId === req.params.id) ?? null);
  });

  router.put("/devices/:id/threshold", async (req, res) => {
    const state = await options.store.update((current) =>
      updateThreshold(current, req.params.id, {
        lowThreshold: Number(req.body.lowThreshold),
        highThreshold: Number(req.body.highThreshold),
        enabled: Boolean(req.body.enabled)
      })
    );
    await emit(options, state);
    res.json(state.thresholds.find((item) => item.deviceId === req.params.id));
  });

  router.post("/devices/:id/commands", async (req, res) => {
    const command = String(req.body.command) as CommandName;
    if (command !== "TURN_ON" && command !== "TURN_OFF") {
      res.status(400).json({ message: "command 仅支持 TURN_ON 或 TURN_OFF" });
      return;
    }

    const state = await options.store.update((current) => applyManualCommand(current, req.params.id, command));
    options.mqttBridge.publishCommand(req.params.id, command, "manual");
    await emit(options, state);
    res.status(202).json({
      message: "控制指令已下发",
      command,
      device: state.devices.find((item) => item.id === req.params.id)
    });
  });

  router.get("/alarms", async (_req, res) => {
    const state = await options.store.getState();
    res.json(state.alarms);
  });

  router.put("/alarms/:id/handle", async (req, res) => {
    const state = await options.store.update((current) => handleAlarm(current, req.params.id));
    await emit(options, state);
    res.json(state.alarms.find((item) => item.id === req.params.id));
  });

  router.post("/agent/chat", async (req, res) => {
    const question = String(req.body.question ?? "");
    const state = await options.store.getState();
    res.json(answerQuestion(question, state));
  });

  return router;
}

async function emit(options: ApiOptions, state?: Awaited<ReturnType<StateStore["getState"]>>): Promise<void> {
  const current = state ?? (await options.store.getState());
  options.io.emit("state:update", buildOverview(current));
}
