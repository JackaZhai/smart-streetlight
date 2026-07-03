export interface KnowledgeEntry {
  id: string;
  title: string;
  category: string;
  keywords: string[];
  source: string;
  content: string;
  suggestedActions: string[];
}

export const knowledgeBaseEntries: KnowledgeEntry[] = [
  {
    id: "kb-offline",
    title: "设备离线排查",
    category: "fault",
    keywords: ["离线", "掉线", "心跳", "心跳超时", "断连", "mqtt", "网络"],
    source: "智慧路灯运维知识库 / 设备离线排查",
    content:
      "设备离线通常与供电、网络、MQTT 连接或设备编号配置有关。排查时先确认最后心跳时间，再检查开发板供电、Wi-Fi 信号、MQTT_URL、设备 ID 是否与平台一致。",
    suggestedActions: ["检查设备供电和网络连接", "确认 MQTT 客户端在线", "核对设备 ID 和接入地址"]
  },
  {
    id: "kb-light-sensor",
    title: "光照异常排查",
    category: "fault",
    keywords: ["光照", "传感器", "异常", "波动", "遮挡", "采样", "卡死"],
    source: "智慧路灯运维知识库 / 光照异常排查",
    content:
      "光照异常可从传感器遮挡、接线松动、采样值卡死、极端读数和环境光突变排查。应结合历史光照曲线、最近上报时间和现场传感器状态判断。",
    suggestedActions: ["检查光照传感器遮挡和接线", "查看历史光照曲线", "复核最近上报值是否连续不变或极端"]
  },
  {
    id: "kb-auto-control",
    title: "自动控灯逻辑",
    category: "control",
    keywords: ["自动", "自动控灯", "开灯", "关灯", "阈值", "lowThreshold", "highThreshold"],
    source: "智慧路灯运维知识库 / 自动控灯逻辑",
    content:
      "自动控灯由低光照阈值和高光照阈值控制。设备在线、自动模式开启且阈值启用时，光照低于 lowThreshold 自动开灯，高于 highThreshold 自动关灯。",
    suggestedActions: ["检查设备自动模式", "确认阈值启用状态", "保持高低阈值间隔以避免频繁抖动"]
  },
  {
    id: "kb-manual-command",
    title: "手动控灯与回执重试",
    category: "control",
    keywords: ["手动", "控灯", "控制", "开关灯", "回执", "重试", "commandId", "command/reply"],
    source: "智慧路灯运维知识库 / 手动控灯与回执重试",
    content:
      "手动控灯会生成控制日志并通过 MQTT command topic 下发。每条指令携带 commandId，设备通过 command/reply 回执执行结果；超时未回执时后端会自动重试并最终标记失败。",
    suggestedActions: ["查看控制日志结果", "检查 MQTT command/reply 是否成对出现", "确认设备继电器执行状态"]
  },
  {
    id: "kb-alarm-flow",
    title: "告警处理流程",
    category: "alarm",
    keywords: ["告警", "处理", "备注", "未处理", "优先级", "闭环"],
    source: "智慧路灯运维知识库 / 告警处理流程",
    content:
      "告警处理需要先确认告警级别和设备位置，再查看设备详情、历史光照和控制记录。处理时填写备注，系统记录处理人、处理时间和处理说明。",
    suggestedActions: ["优先处理高优先级告警", "填写处理备注", "处理后复核设备状态"]
  },
  {
    id: "kb-threshold",
    title: "阈值配置说明",
    category: "config",
    keywords: ["阈值", "规则", "lowThreshold", "highThreshold", "节能", "策略"],
    source: "智慧路灯运维知识库 / 阈值配置说明",
    content:
      "阈值规则要求 lowThreshold 小于 highThreshold。低光照阈值控制开灯，高光照阈值控制关灯，中间区间用于避免路灯频繁切换。",
    suggestedActions: ["确认 lowThreshold 小于 highThreshold", "按场景调整阈值", "保存后观察自动控制记录"]
  },
  {
    id: "kb-mqtt-topic",
    title: "MQTT 主题说明",
    category: "mqtt",
    keywords: ["mqtt", "topic", "telemetry", "command", "command/reply", "主题", "上报"],
    source: "智慧路灯运维知识库 / MQTT 主题说明",
    content:
      "设备通过 streetlight/{deviceId}/telemetry 上报光照和心跳。后端通过 streetlight/{deviceId}/command 下发控制指令，设备通过 streetlight/{deviceId}/command/reply 回传执行结果。",
    suggestedActions: ["检查 telemetry 是否持续上报", "检查 command 是否携带 commandId", "检查 command/reply 回执是否返回"]
  }
];
