import { io } from "socket.io-client";

export type LampStatus = "ON" | "OFF";
export type OnlineStatus = "ONLINE" | "OFFLINE";
export type CommandName = "TURN_ON" | "TURN_OFF";

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
}

export interface AgentAnswer {
  answer: string;
  references: string[];
}

const apiBase = import.meta.env.VITE_API_BASE || "";
const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin.replace("5173", "4000");

export const socket = io(socketUrl, {
  transports: ["websocket", "polling"]
});

export async function fetchOverview(): Promise<Overview> {
  return request("/api/overview");
}

export async function fetchLightHistory(deviceId: string): Promise<LightReading[]> {
  return request(`/api/devices/${deviceId}/light-history`);
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

export async function handleAlarm(alarmId: string): Promise<void> {
  await request(`/api/alarms/${alarmId}/handle`, {
    method: "PUT"
  });
}

export async function askAgent(question: string): Promise<AgentAnswer> {
  return request("/api/agent/chat", {
    method: "POST",
    body: JSON.stringify({ question })
  });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init.headers
    },
    ...init
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}
