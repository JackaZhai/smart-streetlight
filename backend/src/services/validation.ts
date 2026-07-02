import type { CommandName } from "../domain/types.js";

export interface CreateDevicePayload {
  id: string;
  name: string;
  location: string;
}

export interface ThresholdPayload {
  lowThreshold: number;
  highThreshold: number;
  enabled: boolean;
}

export interface CommandPayload {
  command: CommandName;
}

export interface AgentQuestionPayload {
  question: string;
}

export interface AlarmHandlePayload {
  remark?: string;
}

const deviceIdPattern = /^[A-Za-z0-9_-]{2,64}$/;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function parseDeviceIdParam(value: unknown): string {
  const id = parseString(value, "设备编号", 2, 64).trim();
  if (!deviceIdPattern.test(id)) {
    throw new ValidationError("设备编号仅支持 2-64 位字母、数字、下划线和短横线");
  }
  return id;
}

export function parseCreateDevicePayload(value: unknown): CreateDevicePayload {
  const payload = asRecord(value);
  const id = parseDeviceIdParam(payload.id);
  return {
    id,
    name: parseString(payload.name ?? id, "设备名称", 1, 80).trim(),
    location: parseString(payload.location ?? "未绑定点位", "设备位置", 1, 120).trim()
  };
}

export function parseThresholdPayload(value: unknown): ThresholdPayload {
  const payload = asRecord(value);
  const lowThreshold = parseNumber(payload.lowThreshold, "低光照阈值", 0, 1000);
  const highThreshold = parseNumber(payload.highThreshold, "高光照阈值", 0, 1000);
  if (lowThreshold >= highThreshold) {
    throw new ValidationError("阈值配置要求 lowThreshold 小于 highThreshold");
  }
  return {
    lowThreshold,
    highThreshold,
    enabled: parseBoolean(payload.enabled, "阈值启用状态")
  };
}

export function parseCommandPayload(value: unknown): CommandPayload {
  const payload = asRecord(value);
  if (payload.command !== "TURN_ON" && payload.command !== "TURN_OFF") {
    throw new ValidationError("command 仅支持 TURN_ON 或 TURN_OFF");
  }
  return { command: payload.command };
}

export function parseAgentQuestionPayload(value: unknown): AgentQuestionPayload {
  const payload = asRecord(value);
  return {
    question: parseString(payload.question, "问题", 1, 500).trim()
  };
}

export function parseAlarmHandlePayload(value: unknown): AlarmHandlePayload {
  if (value === undefined || value === null) {
    return {};
  }
  const payload = asRecord(value);
  if (payload.remark === undefined || payload.remark === null) {
    return {};
  }
  const remark = parseString(payload.remark, "处理备注", 1, 300).trim();
  return { remark };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("请求体必须是 JSON 对象");
  }
  return value as Record<string, unknown>;
}

function parseString(value: unknown, label: string, minLength: number, maxLength: number): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${label}必须是字符串`);
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) {
    throw new ValidationError(`${label}长度必须为 ${minLength}-${maxLength} 个字符`);
  }
  return trimmed;
}

function parseNumber(value: unknown, label: string, min: number, max: number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max) {
    throw new ValidationError(`${label}必须是 ${min}-${max} 之间的数字`);
  }
  return numberValue;
}

function parseBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new ValidationError(`${label}必须是布尔值`);
  }
  return value;
}
