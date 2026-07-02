import { Router, type NextFunction, type Request, type Response } from "express";
import type { Server } from "socket.io";
import {
  applyManualCommand,
  appendAuditLog,
  buildOverview,
  handleAlarm,
  updateThreshold
} from "../domain/streetlight.js";
import type { AuthUser } from "../domain/types.js";
import { answerQuestion } from "../services/agent.js";
import { requireRole } from "../services/authMiddleware.js";
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

  router.get(
    "/audit-logs",
    requireRole(["admin"], {
      store: options.store,
      action: "audit.read",
      targetType: "audit"
    }),
    async (_req, res) => {
      const state = await options.store.getState();
      res.json((state.auditLogs ?? []).slice(0, 100));
    }
  );

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

  router.post(
    "/devices",
    requireRole(["admin"], {
      store: options.store,
      action: "device.create",
      targetType: "device",
      targetId: (req) => (typeof req.body?.id === "string" ? req.body.id : undefined)
    }),
    async (req, res) => {
      const payload = parseCreateDevicePayload(req.body);
      const nowIso = new Date().toISOString();
      const actor = getActor(res);
      const state = await options.store.update((current) => {
        if (current.devices.some((item) => item.id === payload.id)) {
          return appendAuditLog(
            current,
            {
              actor,
              action: "device.create",
              targetType: "device",
              targetId: payload.id,
              result: "SUCCESS",
              detail: "device already exists"
            },
            nowIso
          );
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
        return appendAuditLog(
          current,
          {
            actor,
            action: "device.create",
            targetType: "device",
            targetId: payload.id,
            result: "SUCCESS"
          },
          nowIso
        );
      });
      await emit(options, state);
      res.status(201).json(buildOverview(state));
    }
  );

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

  router.put(
    "/devices/:id/threshold",
    requireRole(["admin", "operator"], {
      store: options.store,
      action: "threshold.update",
      targetType: "device",
      targetId: (req) => readRouteParam(req.params.id)
    }),
    async (req, res) => {
      const deviceId = parseDeviceIdParam(req.params.id);
      const payload = parseThresholdPayload(req.body);
      const actor = getActor(res);
      const state = await options.store.update((current) =>
        appendAuditLog(
          updateThreshold(current, deviceId, payload),
          {
            actor,
            action: "threshold.update",
            targetType: "device",
            targetId: deviceId,
            result: "SUCCESS"
          }
        )
      );
      await emit(options, state);
      res.json(state.thresholds.find((item) => item.deviceId === deviceId));
    }
  );

  router.post(
    "/devices/:id/commands",
    requireRole(["admin", "operator"], {
      store: options.store,
      action: "command.dispatch",
      targetType: "device",
      targetId: (req) => readRouteParam(req.params.id)
    }),
    async (req, res) => {
      const deviceId = parseDeviceIdParam(req.params.id);
      const { command } = parseCommandPayload(req.body);
      const actor = getActor(res);

      const state = await options.store.update((current) =>
        appendAuditLog(
          applyManualCommand(current, deviceId, command),
          {
            actor,
            action: "command.dispatch",
            targetType: "device",
            targetId: deviceId,
            result: "SUCCESS",
            detail: command
          }
        )
      );
      options.mqttBridge.publishCommand(deviceId, command, "manual");
      await emit(options, state);
      res.status(202).json({
        message: "控制指令已下发",
        command,
        device: state.devices.find((item) => item.id === deviceId)
      });
    }
  );

  router.get("/alarms", async (_req, res) => {
    const state = await options.store.getState();
    res.json(state.alarms);
  });

  router.put(
    "/alarms/:id/handle",
    requireRole(["admin", "operator"], {
      store: options.store,
      action: "alarm.handle",
      targetType: "alarm",
      targetId: (req) => readRouteParam(req.params.id)
    }),
    async (req, res) => {
      const actor = getActor(res);
      const alarmId = readRouteParam(req.params.id) ?? "";
      const state = await options.store.update((current) =>
        appendAuditLog(
          handleAlarm(current, alarmId),
          {
            actor,
            action: "alarm.handle",
            targetType: "alarm",
            targetId: alarmId,
            result: "SUCCESS"
          }
        )
      );
      await emit(options, state);
      res.json(state.alarms.find((item) => item.id === alarmId));
    }
  );

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

function getActor(res: Response): AuthUser {
  return res.locals.user as AuthUser;
}

function readRouteParam(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}
