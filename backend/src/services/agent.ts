import { buildFaultPredictions } from "../domain/streetlight.js";
import type { AppState } from "../domain/types.js";
import { getKnowledgeBase, searchKnowledgeBase, type KnowledgeMatch } from "./knowledgeBase.js";

export interface AgentAnswer {
  answer: string;
  references: string[];
  matches?: KnowledgeMatch[];
  suggestedActions?: string[];
}

export function answerQuestion(question: string, state: AppState): AgentAnswer {
  const activeAlarms = state.alarms.filter((alarm) => !alarm.handled);
  const search = searchKnowledgeBase(question, state, 3);
  const bestSnippet = search.matches[0]?.snippet ?? getKnowledgeBase()[0].content;
  const devicePrefix = search.extractedDeviceId ? `针对 ${search.extractedDeviceId}，` : "";
  const riskSummary = search.extractedDeviceId
    ? buildFaultPredictions(state)
        .filter((risk) => risk.deviceId === search.extractedDeviceId)
        .map((risk) => `${risk.riskLevel} ${risk.riskType}`)
        .join("、")
    : "";
  const answer = [
    `${devicePrefix}${bestSnippet}`,
    search.deviceContext ? `当前设备上下文：${search.deviceContext}。` : "",
    riskSummary ? `系统故障预判命中：${riskSummary}。` : "",
    activeAlarms.length === 0
      ? "当前系统没有未处理告警。"
      : `当前系统存在 ${activeAlarms.length} 条未处理告警，建议优先处理离线、传感器异常和高优先级告警。`
  ]
    .filter(Boolean)
    .join(" ");

  const matchedEntries = getKnowledgeBase().filter((entry) => search.matches.some((match) => match.id === entry.id));
  const suggestedActions = [
    ...matchedEntries.flatMap((entry) => entry.suggestedActions),
    ...(search.extractedDeviceId
      ? buildFaultPredictions(state)
          .filter((risk) => risk.deviceId === search.extractedDeviceId)
          .map((risk) => risk.suggestedAction)
      : [])
  ];

  return {
    answer,
    references: search.matches.map((match) => match.title),
    matches: search.matches,
    suggestedActions: [...new Set(suggestedActions)].slice(0, 5)
  };
}
