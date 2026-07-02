export type LampStatus = "ON" | "OFF";
export type DeviceOnlineStatus = "ONLINE" | "OFFLINE";
export type CommandName = "TURN_ON" | "TURN_OFF";
export type CommandSource = "manual" | "auto";
export type AlarmType = "DEVICE_OFFLINE" | "CONTROL_TIMEOUT" | "SENSOR_ANOMALY";
export type AlarmLevel = "INFO" | "WARN" | "CRITICAL";
export type UserRole = "admin" | "operator" | "viewer";
export type AuditResult = "SUCCESS" | "DENIED";

export interface AuthUser {
  username: string;
  role: UserRole;
}

export interface Device {
  id: string;
  name: string;
  location: string;
  onlineStatus: DeviceOnlineStatus;
  lampStatus: LampStatus;
  autoMode: boolean;
  lastHeartbeatAt: string;
  createdAt: string;
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
  alarmType: AlarmType;
  alarmLevel: AlarmLevel;
  alarmContent: string;
  handled: boolean;
  createdAt: string;
}

export interface ControlLog {
  id: string;
  deviceId: string;
  command: CommandName;
  source: CommandSource;
  result: "QUEUED" | "SUCCESS" | "FAILED";
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorUsername: string;
  actorRole: UserRole;
  action: string;
  targetType: string;
  targetId: string;
  result: AuditResult;
  detail?: string;
  createdAt: string;
}

export interface TelemetryMessage {
  deviceId: string;
  lightIntensity: number;
  lampStatus: LampStatus;
  online: boolean;
  timestamp: string;
}

export interface CommandRequest {
  command: CommandName;
  source?: CommandSource;
}

export interface AppState {
  devices: Device[];
  readings: LightReading[];
  thresholds: ThresholdConfig[];
  alarms: AlarmLog[];
  controlLogs: ControlLog[];
  auditLogs: AuditLog[];
}

export interface AutomationCommand {
  deviceId: string;
  command: CommandName;
  source: "auto";
  reason: string;
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
