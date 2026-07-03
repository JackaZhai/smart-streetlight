import { buildFaultPredictions, getLatestReading } from "../domain/streetlight.js";
import type { AppState } from "../domain/types.js";
import { knowledgeBaseEntries, type KnowledgeEntry } from "./knowledgeBaseData.js";

export interface KnowledgeMatch {
  id: string;
  title: string;
  source: string;
  snippet: string;
  score: number;
  keywords: string[];
}

export interface KnowledgeSearchResult {
  normalizedQuery: string;
  extractedDeviceId?: string;
  deviceContext?: string;
  matches: KnowledgeMatch[];
}

const synonymGroups = [
  ["离线", "掉线", "断连", "心跳超时"],
  ["控灯", "控制", "开关灯", "开灯", "关灯"],
  ["光照", "亮度", "照度", "传感器"],
  ["告警", "报警", "异常", "故障"],
  ["回执", "回复", "应答", "command/reply"],
  ["重试", "超时", "失败"]
];

export function getKnowledgeBase(): KnowledgeEntry[] {
  return knowledgeBaseEntries.map((entry) => ({
    ...entry,
    keywords: [...entry.keywords],
    suggestedActions: [...entry.suggestedActions]
  }));
}

export function searchKnowledgeBase(question: string, state?: AppState, topK = 3): KnowledgeSearchResult {
  const extractedDeviceId = extractDeviceId(question);
  const normalizedQuery = expandSynonyms(normalizeQuery(question));
  const queryTerms = new Set(normalizedQuery.split(/\s+/).filter(Boolean));
  const deviceContext = state && extractedDeviceId ? buildDeviceContext(state, extractedDeviceId) : undefined;
  const scored = knowledgeBaseEntries
    .map((entry) => scoreEntry(entry, normalizedQuery, queryTerms, deviceContext))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, topK);

  return {
    normalizedQuery,
    ...(extractedDeviceId ? { extractedDeviceId } : {}),
    ...(deviceContext ? { deviceContext } : {}),
    matches: scored
  };
}

function scoreEntry(
  entry: KnowledgeEntry,
  normalizedQuery: string,
  queryTerms: Set<string>,
  deviceContext?: string
): KnowledgeMatch {
  let score = 0;
  const hitKeywords: string[] = [];
  const normalizedTitle = normalizeQuery(entry.title);
  const normalizedContent = normalizeQuery(entry.content);

  for (const keyword of entry.keywords) {
    const normalizedKeyword = normalizeQuery(keyword);
    if (normalizedQuery.includes(normalizedKeyword) || queryTerms.has(normalizedKeyword)) {
      score += 4;
      hitKeywords.push(keyword);
      continue;
    }
    if (normalizedTitle.includes(normalizedKeyword) && normalizedQuery.includes(normalizedKeyword.slice(0, 2))) {
      score += 2;
      hitKeywords.push(keyword);
    }
  }
  for (const term of queryTerms) {
    if (term.length >= 2 && normalizedContent.includes(term)) {
      score += 1;
    }
  }
  if (deviceContext && entry.category === "fault") {
    score += 2;
  }

  return {
    id: entry.id,
    title: entry.title,
    source: entry.source,
    snippet: entry.content,
    score,
    keywords: [...new Set(hitKeywords)].slice(0, 6)
  };
}

function normalizeQuery(value: string): string {
  return value
    .toLowerCase()
    .replace(/[，。！？、；：,.!?;:()（）]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandSynonyms(value: string): string {
  let normalized = value;
  for (const group of synonymGroups) {
    if (group.some((word) => normalized.includes(word.toLowerCase()))) {
      normalized = `${normalized} ${group.join(" ").toLowerCase()}`;
    }
  }
  return normalized;
}

function extractDeviceId(question: string): string | undefined {
  return question.match(/\bSL-[A-Za-z0-9_-]+\b/i)?.[0].toUpperCase();
}

function buildDeviceContext(state: AppState, deviceId: string): string | undefined {
  const device = state.devices.find((item) => item.id.toUpperCase() === deviceId.toUpperCase());
  if (!device) {
    return undefined;
  }
  const latest = getLatestReading(state, device.id);
  const activeAlarms = state.alarms.filter((alarm) => alarm.deviceId === device.id && !alarm.handled);
  const failedControls = state.controlLogs.filter((log) => log.deviceId === device.id && log.result === "FAILED");
  const risks = buildFaultPredictions(state).filter((risk) => risk.deviceId === device.id);
  return [
    `${device.id} ${device.name}`,
    `位置=${device.location}`,
    `在线状态=${device.onlineStatus}`,
    `灯具状态=${device.lampStatus}`,
    `最后心跳=${device.lastHeartbeatAt}`,
    latest ? `最新光照=${latest.lightIntensity}lux` : "最新光照=暂无",
    `未处理告警=${activeAlarms.length}`,
    `失败控制=${failedControls.length}`,
    `预判风险=${risks.map((risk) => risk.riskType).join(",") || "无"}`
  ].join("；");
}
