import { io } from "socket.io-client";

export type LampStatus = "ON" | "OFF";
export type OnlineStatus = "ONLINE" | "OFFLINE";
export type CommandName = "TURN_ON" | "TURN_OFF";
export type UserRole = "admin" | "operator" | "viewer";
export type FaultRiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type FaultRiskType = "HEARTBEAT_TIMEOUT" | "LIGHT_SENSOR_ANOMALY" | "CONTROL_FAILURE" | "ALARM_BACKLOG";

export interface Device {
  id: string;
  name: string;
  location: string;
  onlineStatus: OnlineStatus;
  lampStatus: LampStatus;
  autoMode: boolean;
  lastHeartbeatAt: string;
  updatedAt: string;
}

export interface LightReading {
  id: string;
  deviceId: string;
  lightIntensity: number;
  lampStatus: LampStatus;
  reportedAt: string;
}

export interface ThresholdConfig {
  deviceId: string;
  lowThreshold: number;
  highThreshold: number;
  enabled: boolean;
  updatedAt: string;
}

export interface AlarmLog {
  id: string;
  deviceId: string;
  alarmType: string;
  alarmLevel: "INFO" | "WARN" | "CRITICAL";
  alarmContent: string;
  handled: boolean;
  handledBy?: string;
  handledAt?: string;
  handleRemark?: string;
  createdAt: string;
}

export interface FaultPrediction {
  id: string;
  deviceId: string;
  riskType: FaultRiskType;
  riskLevel: FaultRiskLevel;
  reason: string;
  suggestedAction: string;
  evidence: string[];
  createdAt: string;
}

export interface Overview {
  stats: {
    deviceTotal: number;
    onlineDevices: number;
    offlineDevices: number;
    activeAlarms: number;
    averageLight: number;
  };
  devices: Device[];
  latestReadings: LightReading[];
  alarms: AlarmLog[];
  thresholds: ThresholdConfig[];
  faultPredictions: FaultPrediction[];
}

export interface CreateDevicePayload {
  id: string;
  name: string;
  location: string;
}

export interface AgentAnswer {
  answer: string;
  references: string[];
  matches?: KnowledgeMatch[];
  suggestedActions?: string[];
}

export interface KnowledgeMatch {
  id: string;
  title: string;
  source: string;
  snippet: string;
  score: number;
  keywords: string[];
}

export interface AuthUser {
  username: string;
  role: UserRole;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  expiresAt: string;
}

export interface AuditLog {
  id: string;
  actorUsername: string;
  actorRole: UserRole;
  action: string;
  targetType: string;
  targetId: string;
  result: "SUCCESS" | "DENIED";
  detail?: string;
  createdAt: string;
}

type ApiRequestInit = RequestInit & {
  skipAuth?: boolean;
};

const apiBase = import.meta.env.VITE_API_BASE || "";
const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin.replace("5173", "4000");
const sessionKey = "smart-streetlight-session";
let authSession = readStoredSession();

export const socket = io(socketUrl, {
  autoConnect: false,
  auth: authSession ? { token: authSession.token } : undefined,
  transports: ["websocket", "polling"]
});

export function getStoredSession(): AuthSession | null {
  return authSession;
}

export async function login(username: string, password: string): Promise<AuthSession> {
  const session = await request<AuthSession>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
    skipAuth: true
  });
  setAuthSession(session);
  return session;
}

export function logout(): void {
  authSession = null;
  localStorage.removeItem(sessionKey);
  socket.disconnect();
}

export function connectRealtime(): void {
  if (!authSession) {
    return;
  }
  socket.auth = { token: authSession.token };
  if (!socket.connected) {
    socket.connect();
  }
}

export async function fetchOverview(): Promise<Overview> {
  return request("/api/overview");
}

export async function fetchLightHistory(deviceId: string): Promise<LightReading[]> {
  return request(`/api/devices/${deviceId}/light-history`);
}

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  return request("/api/audit-logs");
}

export async function fetchFaultPredictions(): Promise<FaultPrediction[]> {
  return request("/api/fault-predictions");
}

export async function fetchDeviceFaultPredictions(deviceId: string): Promise<FaultPrediction[]> {
  return request(`/api/devices/${deviceId}/fault-predictions`);
}

export async function createDevice(payload: CreateDevicePayload): Promise<Overview> {
  return request("/api/devices", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function sendCommand(deviceId: string, command: CommandName): Promise<void> {
  await request(`/api/devices/${deviceId}/commands`, {
    method: "POST",
    body: JSON.stringify({ command })
  });
}

export async function saveThreshold(deviceId: string, threshold: ThresholdConfig): Promise<ThresholdConfig> {
  return request(`/api/devices/${deviceId}/threshold`, {
    method: "PUT",
    body: JSON.stringify(threshold)
  });
}

export interface HandleAlarmPayload {
  remark: string;
}

export async function handleAlarm(alarmId: string, payload: HandleAlarmPayload): Promise<void> {
  await request(`/api/alarms/${alarmId}/handle`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function askAgent(question: string): Promise<AgentAnswer> {
  return request("/api/agent/chat", {
    method: "POST",
    body: JSON.stringify({ question })
  });
}

async function request<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { skipAuth: _skipAuth, ...requestInit } = init;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(requestInit.headers as Record<string, string> | undefined)
  };

  if (!_skipAuth && authSession) {
    headers.Authorization = `Bearer ${authSession.token}`;
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...requestInit,
    headers
  });

  if (response.status === 401 && !_skipAuth) {
    logout();
  }
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      message = parsed.message ?? text;
    } catch {
      message = text;
    }
    throw new Error(`HTTP ${response.status}: ${message}`);
  }
  return response.json() as Promise<T>;
}

function setAuthSession(session: AuthSession): void {
  authSession = session;
  localStorage.setItem(sessionKey, JSON.stringify(session));
  socket.auth = { token: session.token };
}

function readStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(sessionKey);
    if (!raw) {
      return null;
    }
    const session = JSON.parse(raw) as AuthSession;
    if (!session.token || new Date(session.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(sessionKey);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(sessionKey);
    return null;
  }
}
