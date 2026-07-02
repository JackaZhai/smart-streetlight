import { Router, type NextFunction, type Request, type Response } from "express";
import type { Server } from "socket.io";
import {
  applyManualCommand,
  buildOverview,
  handleAlarm,
  updateThreshold
} from "../domain/streetlight.js";
import { answerQuestion } from "../services/agent.js";
import type { MqttBridge } from "../services/mqttBridge.js";
import type { StateStore } from "../services/store.js";
import {
  parseAgentQuestionPayload,
  parseCommandPayload,
  parseCreateDevicePayload,
  parseDeviceIdParam,
  parseThresholdPayload,
  ValidationError
} from "../services/validation.js";

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
    const deviceId = parseDeviceIdParam(req.params.id);
    const state = await options.store.getState();
    const device = state.devices.find((item) => item.id === deviceId);
    if (!device) {
      res.status(404).json({ message: "设备不存在" });
      return;
    }
    res.json({
      device,
      threshold: state.thresholds.find((item) => item.deviceId === deviceId),
      latestReading: state.readings.filter((item) => item.deviceId === deviceId).at(-1),
      alarms: state.alarms.filter((item) => item.deviceId === deviceId),
      controlLogs: state.controlLogs.filter((item) => item.deviceId === deviceId)
    });
  });

  router.post("/devices", async (req, res) => {
    const payload = parseCreateDevicePayload(req.body);
    const nowIso = new Date().toISOString();
    const state = await options.store.update((current) => {
      if (current.devices.some((item) => item.id === payload.id)) {
        return current;
      }
      current.devices.push({
        id: payload.id,
        name: payload.name,
        location: payload.location,
        onlineStatus: "OFFLINE",
        lampStatus: "OFF",
        autoMode: true,
        lastHeartbeatAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso
      });
      current.thresholds.push({
        deviceId: payload.id,
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
    const deviceId = parseDeviceIdParam(req.params.id);
    const state = await options.store.getState();
    const latest = state.readings.filter((item) => item.deviceId === deviceId).at(-1);
    res.json(latest ?? null);
  });

  router.get("/devices/:id/light-history", async (req, res) => {
    const deviceId = parseDeviceIdParam(req.params.id);
    const state = await options.store.getState();
    res.json(state.readings.filter((item) => item.deviceId === deviceId).slice(-80));
  });

  router.get("/devices/:id/threshold", async (req, res) => {
    const deviceId = parseDeviceIdParam(req.params.id);
    const state = await options.store.getState();
    res.json(state.thresholds.find((item) => item.deviceId === deviceId) ?? null);
  });

  router.put("/devices/:id/threshold", async (req, res) => {
    const deviceId = parseDeviceIdParam(req.params.id);
    const payload = parseThresholdPayload(req.body);
    const state = await options.store.update((current) =>
      updateThreshold(current, deviceId, payload)
    );
    await emit(options, state);
    res.json(state.thresholds.find((item) => item.deviceId === deviceId));
  });

  router.post("/devices/:id/commands", async (req, res) => {
    const deviceId = parseDeviceIdParam(req.params.id);
    const { command } = parseCommandPayload(req.body);

    const state = await options.store.update((current) => applyManualCommand(current, deviceId, command));
    options.mqttBridge.publishCommand(deviceId, command, "manual");
    await emit(options, state);
    res.status(202).json({
      message: "控制指令已下发",
      command,
      device: state.devices.find((item) => item.id === deviceId)
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
    const { question } = parseAgentQuestionPayload(req.body);
    const state = await options.store.getState();
    res.json(answerQuestion(question, state));
  });

  router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof ValidationError) {
      res.status(400).json({ message: error.message });
      return;
    }
    next(error);
  });

  return router;
}

async function emit(options: ApiOptions, state?: Awaited<ReturnType<StateStore["getState"]>>): Promise<void> {
  const current = state ?? (await options.store.getState());
  options.io.emit("state:update", buildOverview(current));
}
