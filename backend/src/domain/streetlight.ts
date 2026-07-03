import { createHash } from "node:crypto";
import type {
  AlarmLog,
  AppState,
  AuditLog,
  AuthUser,
  AutomationCommand,
  CommandReplyMessage,
  CommandName,
  CommandSource,
  Device,
  FaultPrediction,
  FaultRiskLevel,
  FaultRiskType,
  LightReading,
  Overview,
  TelemetryMessage,
  ThresholdConfig
} from "./types.js";

const HISTORY_LIMIT = 240;
const AUDIT_LIMIT = 500;
const RISK_SEVERITY: Record<FaultRiskLevel, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

export interface AuditLogInput {
  actor: AuthUser;
  action: string;
  targetType: string;
  targetId?: string;
  result: AuditLog["result"];
  detail?: string;
}

export function createSeedState(nowIso = new Date().toISOString()): AppState {
  const devices: Device[] = [
    createDevice("SL-001", "1 号路灯", "校园主干道东侧", "ON", nowIso),
    createDevice("SL-002", "2 号路灯", "图书馆入口", "OFF", nowIso),
    createDevice("SL-003", "3 号路灯", "宿舍区南门", "ON", nowIso),
    createDevice("SL-004", "4 号路灯", "体育场西侧", "OFF", nowIso)
  ];

  const thresholds = devices.map((device) => ({
    deviceId: device.id,
    lowThreshold: 120,
    highThreshold: 320,
    enabled: true,
    updatedAt: nowIso
  }));

  const readings = devices.flatMap((device, deviceIndex) =>
    Array.from({ length: 12 }, (_, index) => {
      const reportedAt = new Date(new Date(nowIso).getTime() - (11 - index) * 60_000).toISOString();
      return {
        id: makeId("reading", `${device.id}-${index}`),
        deviceId: device.id,
        lightIntensity: Math.max(40, 210 + deviceIndex * 24 + Math.round(Math.sin(index / 2) * 90)),
        lampStatus: device.lampStatus,
        reportedAt
      };
    })
  );

  return {
    devices,
    readings,
    thresholds,
    alarms: [
      {
        id: makeId("alarm", "seed-1"),
        deviceId: "SL-002",
        alarmType: "SENSOR_ANOMALY",
        alarmLevel: "WARN",
        alarmContent: "光照数据连续波动异常，建议检查传感器遮挡情况。",
        handled: false,
        createdAt: nowIso
      }
    ],
    controlLogs: [],
    auditLogs: []
  };
}

export function applyTelemetry(
  state: AppState,
  telemetry: TelemetryMessage
): { state: AppState; commands: AutomationCommand[] } {
  const next = cloneState(state);
  const nowIso = telemetry.timestamp || new Date().toISOString();
  const device = ensureDevice(next, telemetry.deviceId, nowIso);
  device.onlineStatus = telemetry.online ? "ONLINE" : "OFFLINE";
  device.lampStatus = telemetry.lampStatus;
  device.lastHeartbeatAt = nowIso;
  device.updatedAt = nowIso;

  next.readings.push({
    id: makeId("reading", `${telemetry.deviceId}-${nowIso}-${telemetry.lightIntensity}`),
    deviceId: telemetry.deviceId,
    lightIntensity: telemetry.lightIntensity,
    lampStatus: telemetry.lampStatus,
    reportedAt: nowIso
  });
  next.readings = next.readings
    .sort((a, b) => a.reportedAt.localeCompare(b.reportedAt))
    .slice(-HISTORY_LIMIT);

  return evaluateAutomation(next, telemetry.deviceId, telemetry.lightIntensity, nowIso);
}

export function evaluateAutomation(
  state: AppState,
  deviceId: string,
  lightIntensity: number,
  nowIso = new Date().toISOString()
): { state: AppState; commands: AutomationCommand[] } {
  const next = cloneState(state);
  const device = next.devices.find((item) => item.id === deviceId);
  const threshold = getThreshold(next, deviceId, nowIso);

  if (!device || !threshold.enabled || !device.autoMode || device.onlineStatus === "OFFLINE") {
    return { state: next, commands: [] };
  }

  const command = getAutomationCommand(device.lampStatus, lightIntensity, threshold);
  if (!command) {
    return { state: next, commands: [] };
  }

  device.lampStatus = command === "TURN_ON" ? "ON" : "OFF";
  device.updatedAt = nowIso;
  const commandId = makeId("control", `${deviceId}-${command}-${nowIso}`);
  next.controlLogs.unshift({
    id: commandId,
    deviceId,
    command,
    source: "auto",
    result: "QUEUED",
    createdAt: nowIso
  });

  return {
    state: next,
    commands: [
      {
        commandId,
        deviceId,
        command,
        source: "auto",
        reason: lightIntensity < threshold.lowThreshold ? "光照低于开灯阈值" : "光照高于关灯阈值"
      }
    ]
  };
}

export function applyManualCommand(
  state: AppState,
  deviceId: string,
  command: CommandName,
  source: CommandSource = "manual",
  nowIso = new Date().toISOString()
): AppState {
  const next = cloneState(state);
  const device = ensureDevice(next, deviceId, nowIso);
  device.lampStatus = command === "TURN_ON" ? "ON" : "OFF";
  device.updatedAt = nowIso;
  const commandId = makeId("control", `${deviceId}-${command}-${source}-${nowIso}`);
  next.controlLogs.unshift({
    id: commandId,
    deviceId,
    command,
    source,
    result: "QUEUED",
    createdAt: nowIso
  });
  return next;
}

export function applyCommandReply(state: AppState, reply: CommandReplyMessage): AppState {
  const next = cloneState(state);
  const controlLog = findControlLogForReply(next, reply);
  if (controlLog) {
    controlLog.result = reply.result;
  }
  return next;
}

export function markControlCommandFailed(state: AppState, commandId: string): AppState {
  const next = cloneState(state);
  const controlLog = next.controlLogs.find((item) => item.id === commandId);
  if (controlLog && controlLog.result === "QUEUED") {
    controlLog.result = "FAILED";
  }
  return next;
}

export function markOfflineDevices(
  state: AppState,
  nowIso = new Date().toISOString(),
  timeoutMs = 90_000
): AppState {
  const next = cloneState(state);
  const now = new Date(nowIso).getTime();

  for (const device of next.devices) {
    const lastHeartbeat = new Date(device.lastHeartbeatAt).getTime();
    const isTimeout = Number.isFinite(lastHeartbeat) && now - lastHeartbeat > timeoutMs;
    if (!isTimeout || device.onlineStatus === "OFFLINE") {
      continue;
    }

    device.onlineStatus = "OFFLINE";
    device.updatedAt = nowIso;
    const existingOpenAlarm = next.alarms.some(
      (alarm) => alarm.deviceId === device.id && alarm.alarmType === "DEVICE_OFFLINE" && !alarm.handled
    );
    if (!existingOpenAlarm) {
      next.alarms.unshift({
        id: makeId("alarm", `${device.id}-offline-${nowIso}`),
        deviceId: device.id,
        alarmType: "DEVICE_OFFLINE",
        alarmLevel: "WARN",
        alarmContent: `${device.name} 心跳超时，设备已判定为离线。`,
        handled: false,
        createdAt: nowIso
      });
    }
  }

  return next;
}

export function updateThreshold(
  state: AppState,
  deviceId: string,
  patch: Partial<Pick<ThresholdConfig, "lowThreshold" | "highThreshold" | "enabled">>,
  nowIso = new Date().toISOString()
): AppState {
  const next = cloneState(state);
  const threshold = getThreshold(next, deviceId, nowIso);
  threshold.lowThreshold = Number.isFinite(patch.lowThreshold) ? Number(patch.lowThreshold) : threshold.lowThreshold;
  threshold.highThreshold = Number.isFinite(patch.highThreshold) ? Number(patch.highThreshold) : threshold.highThreshold;
  threshold.enabled = typeof patch.enabled === "boolean" ? patch.enabled : threshold.enabled;
  threshold.updatedAt = nowIso;
  return next;
}

export interface AlarmHandleInput {
  handledAt?: string;
  remark?: string;
}

export function handleAlarm(
  state: AppState,
  alarmId: string,
  actor?: AuthUser,
  input: AlarmHandleInput = {}
): AppState {
  const next = cloneState(state);
  const alarm = next.alarms.find((item) => item.id === alarmId);
  if (alarm) {
    alarm.handled = true;
    alarm.handledBy = actor?.username;
    alarm.handledAt = input.handledAt ?? new Date().toISOString();
    const remark = input.remark?.trim();
    if (remark) {
      alarm.handleRemark = remark;
    }
  }
  return next;
}

export function appendAuditLog(
  state: AppState,
  input: AuditLogInput,
  nowIso = new Date().toISOString()
): AppState {
  const next = cloneState(state);
  const targetId = input.targetId?.trim() || "-";
  const log: AuditLog = {
    id: makeId(
      "audit",
      `${input.actor.username}-${input.action}-${input.targetType}-${targetId}-${input.result}-${nowIso}-${next.auditLogs.length}`
    ),
    actorUsername: input.actor.username,
    actorRole: input.actor.role,
    action: input.action,
    targetType: input.targetType,
    targetId,
    result: input.result,
    ...(input.detail ? { detail: input.detail } : {}),
    createdAt: nowIso
  };
  next.auditLogs = [log, ...(next.auditLogs ?? [])].slice(0, AUDIT_LIMIT);
  return next;
}

export function buildOverview(state: AppState): Overview {
  const latestReadings = state.devices
    .map((device) => getLatestReading(state, device.id))
    .filter((reading): reading is LightReading => Boolean(reading));
  const averageLight =
    latestReadings.length === 0
      ? 0
      : Math.round(latestReadings.reduce((sum, reading) => sum + reading.lightIntensity, 0) / latestReadings.length);

  return {
    stats: {
      deviceTotal: state.devices.length,
      onlineDevices: state.devices.filter((device) => device.onlineStatus === "ONLINE").length,
      offlineDevices: state.devices.filter((device) => device.onlineStatus === "OFFLINE").length,
      activeAlarms: state.alarms.filter((alarm) => !alarm.handled).length,
      averageLight
    },
    devices: state.devices,
    latestReadings,
    alarms: state.alarms.slice(0, 20),
    thresholds: state.thresholds,
    faultPredictions: buildFaultPredictions(state)
  };
}

export function buildFaultPredictions(state: AppState, nowIso = new Date().toISOString()): FaultPrediction[] {
  const predictions = state.devices.flatMap((device) => {
    const devicePredictions: FaultPrediction[] = [];
    const heartbeatRisk = predictHeartbeatRisk(device, nowIso);
    if (heartbeatRisk) {
      devicePredictions.push(heartbeatRisk);
    }
    const sensorRisk = predictLightSensorRisk(state, device, nowIso);
    if (sensorRisk) {
      devicePredictions.push(sensorRisk);
    }
    const controlRisk = predictControlFailureRisk(state, device, nowIso);
    if (controlRisk) {
      devicePredictions.push(controlRisk);
    }
    const alarmRisk = predictAlarmBacklogRisk(state, device, nowIso);
    if (alarmRisk) {
      devicePredictions.push(alarmRisk);
    }
    return devicePredictions;
  });

  return predictions.sort((a, b) => {
    const severityDiff = RISK_SEVERITY[b.riskLevel] - RISK_SEVERITY[a.riskLevel];
    if (severityDiff !== 0) {
      return severityDiff;
    }
    return a.deviceId.localeCompare(b.deviceId) || a.riskType.localeCompare(b.riskType);
  });
}

export function getLatestReading(state: AppState, deviceId: string): LightReading | undefined {
  return state.readings
    .filter((reading) => reading.deviceId === deviceId)
    .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))[0];
}

export function cloneState(state: AppState): AppState {
  return {
    devices: state.devices.map((item) => ({ ...item })),
    readings: state.readings.map((item) => ({ ...item })),
    thresholds: state.thresholds.map((item) => ({ ...item })),
    alarms: state.alarms.map((item) => ({ ...item })),
    controlLogs: state.controlLogs.map((item) => ({ ...item })),
    auditLogs: (state.auditLogs ?? []).map((item) => ({ ...item }))
  };
}

function createDevice(id: string, name: string, location: string, lampStatus: "ON" | "OFF", nowIso: string): Device {
  return {
    id,
    name,
    location,
    onlineStatus: "ONLINE",
    lampStatus,
    autoMode: true,
    lastHeartbeatAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

function predictHeartbeatRisk(device: Device, nowIso: string): FaultPrediction | undefined {
  const minutesSinceHeartbeat = diffMinutes(device.lastHeartbeatAt, nowIso);
  const isOffline = device.onlineStatus === "OFFLINE";
  const isStale = Number.isFinite(minutesSinceHeartbeat) && minutesSinceHeartbeat >= 2;
  if (!isOffline && !isStale) {
    return undefined;
  }
  const riskLevel: FaultRiskLevel = isOffline || minutesSinceHeartbeat >= 5 ? "HIGH" : "MEDIUM";
  return createFaultPrediction({
    deviceId: device.id,
    riskType: "HEARTBEAT_TIMEOUT",
    riskLevel,
    reason: isOffline ? "设备已处于离线状态，心跳链路存在中断风险。" : "设备心跳超过 2 分钟未刷新。",
    suggestedAction: "检查设备供电、网络连接、MQTT 客户端状态和设备编号配置。",
    evidence: [
      `onlineStatus=${device.onlineStatus}`,
      `lastHeartbeatAt=${device.lastHeartbeatAt}`,
      `minutesSinceHeartbeat=${Math.max(0, Math.round(minutesSinceHeartbeat))}`
    ],
    createdAt: nowIso
  });
}

function predictLightSensorRisk(state: AppState, device: Device, nowIso: string): FaultPrediction | undefined {
  const readings = state.readings
    .filter((reading) => reading.deviceId === device.id)
    .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
    .slice(0, 6);
  if (readings.length < 4) {
    return undefined;
  }
  const values = readings.map((reading) => reading.lightIntensity);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;
  const sameValueCount = values.filter((value) => value === values[0]).length;
  const extreme = max >= 950 || min <= 5;
  const flatLine = sameValueCount >= 4;
  const jumpy = range >= 650;
  if (!extreme && !flatLine && !jumpy) {
    return undefined;
  }
  const reason = extreme
    ? "最近光照读数出现极端值，传感器可能遮挡、短路或采样异常。"
    : flatLine
      ? "最近多次光照读数完全一致，传感器可能卡死或上报缓存值。"
      : "最近光照读数波动过大，可能存在传感器抖动或环境干扰。";
  return createFaultPrediction({
    deviceId: device.id,
    riskType: "LIGHT_SENSOR_ANOMALY",
    riskLevel: extreme || flatLine ? "HIGH" : "MEDIUM",
    reason,
    suggestedAction: "查看历史光照曲线，检查传感器遮挡、接线和采样频率。",
    evidence: [`latestValues=${values.join(",")}`, `range=${range}`, `lastReportedAt=${readings[0].reportedAt}`],
    createdAt: nowIso
  });
}

function predictControlFailureRisk(state: AppState, device: Device, nowIso: string): FaultPrediction | undefined {
  const failedLogs = state.controlLogs.filter((log) => log.deviceId === device.id && log.result === "FAILED").slice(0, 5);
  if (failedLogs.length === 0) {
    return undefined;
  }
  return createFaultPrediction({
    deviceId: device.id,
    riskType: "CONTROL_FAILURE",
    riskLevel: failedLogs.length >= 2 ? "HIGH" : "MEDIUM",
    reason: "最近存在控灯指令失败或回执超时，继电器、通信或设备执行链路可能异常。",
    suggestedAction: "复核 MQTT command/reply、设备继电器状态和现场灯具执行结果。",
    evidence: failedLogs.map((log) => `${log.createdAt} ${log.command} ${log.source} ${log.result}`),
    createdAt: nowIso
  });
}

function predictAlarmBacklogRisk(state: AppState, device: Device, nowIso: string): FaultPrediction | undefined {
  const activeAlarms = state.alarms.filter((alarm) => alarm.deviceId === device.id && !alarm.handled);
  if (activeAlarms.length === 0) {
    return undefined;
  }
  const hasCritical = activeAlarms.some((alarm) => alarm.alarmLevel === "CRITICAL");
  return createFaultPrediction({
    deviceId: device.id,
    riskType: "ALARM_BACKLOG",
    riskLevel: hasCritical || activeAlarms.length >= 3 ? "HIGH" : "MEDIUM",
    reason: "设备存在未处理告警积压，可能影响后续自动控制和运维响应。",
    suggestedAction: "优先处理高优先级告警，补充处理备注并复核设备恢复状态。",
    evidence: activeAlarms.map((alarm) => `${alarm.createdAt} ${alarm.alarmLevel} ${alarm.alarmType}`),
    createdAt: nowIso
  });
}

function createFaultPrediction(input: Omit<FaultPrediction, "id">): FaultPrediction {
  return {
    id: makeId("fault", `${input.deviceId}-${input.riskType}-${input.createdAt}`),
    ...input
  };
}

function diffMinutes(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000;
}

function ensureDevice(state: AppState, deviceId: string, nowIso: string): Device {
  let device = state.devices.find((item) => item.id === deviceId);
  if (!device) {
    device = createDevice(deviceId, `路灯 ${deviceId}`, "未绑定点位", "OFF", nowIso);
    state.devices.push(device);
    state.thresholds.push({
      deviceId,
      lowThreshold: 120,
      highThreshold: 320,
      enabled: true,
      updatedAt: nowIso
    });
  }
  return device;
}

function getThreshold(state: AppState, deviceId: string, nowIso: string): ThresholdConfig {
  let threshold = state.thresholds.find((item) => item.deviceId === deviceId);
  if (!threshold) {
    threshold = {
      deviceId,
      lowThreshold: 120,
      highThreshold: 320,
      enabled: true,
      updatedAt: nowIso
    };
    state.thresholds.push(threshold);
  }
  return threshold;
}

function getAutomationCommand(
  lampStatus: "ON" | "OFF",
  lightIntensity: number,
  threshold: ThresholdConfig
): CommandName | null {
  if (lightIntensity < threshold.lowThreshold && lampStatus === "OFF") {
    return "TURN_ON";
  }
  if (lightIntensity > threshold.highThreshold && lampStatus === "ON") {
    return "TURN_OFF";
  }
  return null;
}

function findControlLogForReply(state: AppState, reply: CommandReplyMessage) {
  if (reply.commandId) {
    const exact = state.controlLogs.find((item) => item.id === reply.commandId);
    if (exact) {
      return exact;
    }
  }
  return state.controlLogs.find(
    (item) => item.deviceId === reply.deviceId && item.command === reply.command && item.result === "QUEUED"
  );
}

function makeId(prefix: string, seed: string): string {
  return `${prefix}-${createHash("sha1").update(seed).digest("hex").slice(0, 16)}`;
}
