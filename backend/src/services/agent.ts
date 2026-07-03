import { buildFaultPredictions } from "../domain/streetlight.js";
import type { AppState } from "../domain/types.js";
import { createDeepSeekClient } from "./deepseek.js";
import { getKnowledgeBase, searchKnowledgeBase, type KnowledgeMatch } from "./knowledgeBase.js";

export interface AgentAnswer {
  answer: string;
  references: string[];
  matches?: KnowledgeMatch[];
  suggestedActions?: string[];
  provider?: "deepseek" | "local";
  model?: string;
}

export async function answerQuestion(question: string, state: AppState): Promise<AgentAnswer> {
  const activeAlarms = state.alarms.filter((alarm) => !alarm.handled);
  const faultPredictions = buildFaultPredictions(state);
  const search = searchKnowledgeBase(question, state, 3);
  const bestSnippet = search.matches[0]?.snippet ?? getKnowledgeBase()[0].content;
  const devicePrefix = search.extractedDeviceId ? `针对 ${search.extractedDeviceId}，` : "";
  const riskSummary = search.extractedDeviceId
    ? faultPredictions
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
      ? faultPredictions
          .filter((risk) => risk.deviceId === search.extractedDeviceId)
          .map((risk) => risk.suggestedAction)
      : [])
  ];
  const uniqueSuggestedActions = [...new Set(suggestedActions)].slice(0, 5);
  const references = search.matches.map((match) => match.title);
  const deepseek = createDeepSeekClient();

  try {
    const completion = await deepseek.chat([
      {
        role: "system",
        content:
          "你是智慧路灯节能系统的运维问答助手。只能依据给定知识库、设备状态、告警和故障预判回答；信息不足时要说明缺口，不能编造设备数据。回答使用中文，面向现场运维人员，先给结论，再给操作步骤。"
      },
      {
        role: "user",
        content: buildDeepSeekPrompt({
          question,
          search,
          activeAlarms,
          faultPredictions,
          suggestedActions: uniqueSuggestedActions
        })
      }
    ]);

    if (completion) {
      return {
        answer: completion.content,
        references,
        matches: search.matches,
        suggestedActions: uniqueSuggestedActions,
        provider: completion.provider,
        model: completion.model
      };
    }
  } catch {
    // Keep the maintenance workflow usable when the external LLM is unavailable.
  }

  return {
    answer,
    references,
    matches: search.matches,
    suggestedActions: uniqueSuggestedActions,
    provider: "local"
  };
}

interface DeepSeekPromptInput {
  question: string;
  search: ReturnType<typeof searchKnowledgeBase>;
  activeAlarms: AppState["alarms"];
  faultPredictions: ReturnType<typeof buildFaultPredictions>;
  suggestedActions: string[];
}

function buildDeepSeekPrompt(input: DeepSeekPromptInput): string {
  const knowledge = input.search.matches.length
    ? input.search.matches
        .map(
          (match, index) =>
            `${index + 1}. ${match.title}（来源：${match.source}，分数：${match.score}）\n片段：${match.snippet}`
        )
        .join("\n")
    : "未命中知识库片段。";
  const relatedRisks = input.search.extractedDeviceId
    ? input.faultPredictions.filter((risk) => risk.deviceId === input.search.extractedDeviceId)
    : input.faultPredictions.slice(0, 5);
  const risks = relatedRisks.length
    ? relatedRisks
        .map(
          (risk) =>
            `${risk.deviceId} ${risk.riskLevel} ${risk.riskType}：${risk.reason}；建议：${risk.suggestedAction}；证据：${risk.evidence.join("，")}`
        )
        .join("\n")
    : "暂无故障预判。";
  const alarms = input.activeAlarms.length
    ? input.activeAlarms
        .slice(0, 8)
        .map((alarm) => `${alarm.deviceId} ${alarm.alarmLevel} ${alarm.alarmType}：${alarm.alarmContent}`)
        .join("\n")
    : "暂无未处理告警。";
  const actions = input.suggestedActions.length ? input.suggestedActions.join("；") : "暂无推荐操作。";

  return [
    `用户问题：${input.question}`,
    `识别设备：${input.search.extractedDeviceId ?? "未指定"}`,
    `设备上下文：${input.search.deviceContext ?? "无"}`,
    `知识命中：\n${knowledge}`,
    `故障预判：\n${risks}`,
    `未处理告警：\n${alarms}`,
    `推荐操作候选：${actions}`,
    "输出要求：结合知识命中、设备上下文、故障预判和告警状态，给出可执行建议；不要输出 JSON。"
  ].join("\n\n");
}
