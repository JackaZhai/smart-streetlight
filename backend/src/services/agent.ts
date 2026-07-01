import type { AppState } from "../domain/types.js";

export interface AgentAnswer {
  answer: string;
  references: string[];
}

const faq = [
  {
    keywords: ["离线", "心跳", "掉线"],
    answer:
      "设备离线通常先检查供电、网络和 MQTT 连接。若心跳超过阈值未恢复，建议现场确认开发板供电、Wi-Fi 信号和设备编号是否配置正确。",
    references: ["设备心跳检测", "MQTT 连接状态", "现场供电检查"]
  },
  {
    keywords: ["光照", "阈值", "自动"],
    answer:
      "自动开关灯由 lowThreshold 和 highThreshold 控制。光照低于开灯阈值会下发开灯指令，高于关灯阈值会下发关灯指令，建议保留上下阈值差避免频繁抖动。",
    references: ["阈值配置", "自动联动规则"]
  },
  {
    keywords: ["传感器", "异常", "波动"],
    answer:
      "光照传感器异常可从遮挡、接线松动、采样频率过高和环境光突变四个方向排查。演示阶段可先查看历史曲线是否连续异常。",
    references: ["历史光照趋势", "传感器接线记录"]
  },
  {
    keywords: ["开灯", "关灯", "控制"],
    answer:
      "手动控制会通过后端生成控制日志，并通过 MQTT command topic 下发到设备。若设备未执行，优先检查设备是否在线以及 command/reply 是否返回。",
    references: ["控制日志", "MQTT command/reply"]
  }
];

export function answerQuestion(question: string, state: AppState): AgentAnswer {
  const normalized = question.trim();
  const activeAlarms = state.alarms.filter((alarm) => !alarm.handled);
  const matched = faq.find((item) => item.keywords.some((keyword) => normalized.includes(keyword)));

  if (matched) {
    return {
      answer: enrichWithContext(matched.answer, activeAlarms.length),
      references: matched.references
    };
  }

  return {
    answer: enrichWithContext(
      "可以从实时光照、设备在线状态、阈值配置、控制日志和告警日志五个位置定位问题。建议先确认设备是否在线，再看最近一次遥测和控制回执。",
      activeAlarms.length
    ),
    references: ["实时监测", "设备列表", "告警日志", "控制日志"]
  };
}

function enrichWithContext(answer: string, activeAlarmCount: number): string {
  if (activeAlarmCount === 0) {
    return `${answer} 当前系统没有未处理告警。`;
  }
  return `${answer} 当前系统存在 ${activeAlarmCount} 条未处理告警，建议优先处理离线和传感器异常。`;
}
