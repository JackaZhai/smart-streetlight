# 故障预判与 RAG 检索优化报告

## 1. 完成内容

本次新增规则型故障预判能力，并将故障结果接入设备台账、设备详情和 RAG 问答上下文。实现不依赖机器学习训练，优先保证演示稳定性和产品化可解释性。

- 新增 `buildFaultPredictions()`，基于当前状态实时计算设备风险。
- 新增 `/api/fault-predictions` 和 `/api/devices/{id}/fault-predictions`。
- `GET /api/overview` 返回 `faultPredictions`，前端可直接展示风险。
- 设备台账新增故障预判风险列。
- 设备详情新增故障预判卡片，展示风险类型、等级、原因和建议动作。
- 智能问答侧边栏展示当前设备风险摘要。
- RAG 检索按设备 ID、同义词、设备上下文和故障相关性排序，并将排序结果注入 DeepSeek 提示词。

## 2. 故障预判规则

| 风险类型 | 触发依据 | 风险等级 |
| --- | --- | --- |
| `HEARTBEAT_TIMEOUT` | 设备离线或心跳超过阈值未刷新 | 离线或超过 5 分钟为 `HIGH`，超过 2 分钟为 `MEDIUM` |
| `LIGHT_SENSOR_ANOMALY` | 最近光照出现极端值、连续不变或大幅波动 | 极端值/连续不变为 `HIGH`，大幅波动为 `MEDIUM` |
| `CONTROL_FAILURE` | 最近控制日志存在 `FAILED` | 1 条为 `MEDIUM`，多条为 `HIGH` |
| `ALARM_BACKLOG` | 设备存在未处理告警 | 高优先级或多条为 `HIGH`，普通积压为 `MEDIUM` |

输出结构：

```json
{
  "id": "fault-xxxx",
  "deviceId": "SL-001",
  "riskType": "CONTROL_FAILURE",
  "riskLevel": "MEDIUM",
  "reason": "最近存在控灯指令失败或回执超时...",
  "suggestedAction": "复核 MQTT command/reply、设备继电器状态和现场灯具执行结果。",
  "evidence": ["2026-07-03T08:04:00.000Z TURN_ON manual FAILED"],
  "createdAt": "2026-07-03T08:05:00.000Z"
}
```

## 3. RAG 检索优化

- 支持设备 ID 识别，例如 `SL-003`。
- 识别到设备 ID 后，注入设备位置、在线状态、灯具状态、最后心跳、最新光照、未处理告警、失败控制和预判风险。
- 同义词归一化覆盖离线、控灯、光照、告警、回执、重试等常见表达。
- `fault` 分类知识在问题带设备上下文时获得额外权重。
- 返回 topK 命中片段，前端展示知识来源和片段内容。
- 检索结果、设备上下文、未处理告警和故障预判会共同进入 DeepSeek 用户提示词；DeepSeek 不可用时继续使用本地 RAG 兜底答案。

## 4. 与问答接口联动

`POST /api/agent/chat` 内部流程：

```text
parseAgentQuestionPayload()
  -> searchKnowledgeBase(question, state)
  -> buildFaultPredictions(state)
  -> 组合知识片段、设备上下文、告警和风险
  -> 调用 DeepSeek Chat Completions
  -> 返回 answer / provider / model / references / matches / suggestedActions
  -> DeepSeek 未配置或失败时回退本地 RAG 答案
```

当问题包含设备 ID 时，回答会优先说明该设备上下文和命中的故障预判结果。

## 5. 测试与验收

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| 故障预判领域测试 | `npm --workspace backend test -- streetlight.test.ts` | 覆盖心跳超时、光照异常、控制失败、告警积压 |
| API 接线测试 | `npm --workspace backend test -- api.test.ts` | 覆盖故障预判列表和单设备接口接线 |
| RAG 检索测试 | `npm --workspace backend test -- knowledgeBase.test.ts` | 覆盖同义词、设备上下文和问答增强 |
| 前端故障预判测试 | `npm --workspace frontend test -- FaultPredictionFlow.test.ts` | 覆盖设备台账、设备详情和 API 接线 |

## 6. Git 提交与分支情况

| 项目 | 说明 |
| --- | --- |
| 当前分支 | `main` |
| 跟踪远端 | `origin/main` |
| 基准提交 | `9b4e75b docs: update workflow git status` |
| 功能提交 | `feat: add rag fault prediction workflows` |
| 文档提交 | `docs: add rag fault prediction reports` |
| DeepSeek 调整提交 | `feat: use deepseek for rag answers` |
| 远端同步 | 完成提交后推送到 `origin/main` |
