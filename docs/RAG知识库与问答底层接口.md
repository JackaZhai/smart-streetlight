# RAG 知识库与问答底层接口报告

## 1. 完成内容

本次将原有硬编码 FAQ 问答升级为“本地 RAG 检索 + DeepSeek 大模型生成 + 本地兜底”的问答底层接口。知识库、设备状态和故障预判仍由本系统本地生成，DeepSeek 负责根据上下文组织自然语言回答；未配置 API Key 或外部请求失败时，系统自动回退到本地 RAG 答案，保证本地开发、Spark 服务器和 Docker Compose 环境均可运行。

- 新增本地知识库数据文件，覆盖 7 类运维知识。
- 新增知识库检索模块，支持关键词、同义词和设备 ID 识别。
- 问答接口先组合知识库命中片段、设备状态、告警和故障预判，再调用 DeepSeek Chat Completions 生成回答。
- `/api/agent/chat` 保持原有 `answer`、`references` 字段，并扩展 `matches`、`suggestedActions`、`provider`、`model`。
- 前端智能问答展示回答正文、模型来源、引用来源、知识命中片段和推荐操作。

## 2. 知识库结构

知识库条目包含：

| 字段 | 说明 |
| --- | --- |
| `id` | 知识条目编号 |
| `title` | 条目标题 |
| `category` | 分类，例如 `fault`、`control`、`alarm`、`mqtt` |
| `keywords` | 检索关键词和同义词 |
| `source` | 引用来源 |
| `content` | 知识正文 |
| `suggestedActions` | 推荐操作 |

当前覆盖主题：

1. 设备离线排查
2. 光照异常排查
3. 自动控灯逻辑
4. 手动控灯与回执重试
5. 告警处理流程
6. 阈值配置说明
7. MQTT 主题说明

## 3. 检索流程

```text
用户问题
  -> 中文标点清洗和小写归一化
  -> 同义词扩展
  -> 设备 ID 识别，例如 SL-003
  -> 生成设备上下文
  -> 知识库条目打分
  -> 返回 topK 命中片段
  -> 组装 DeepSeek 提示词
  -> DeepSeek 生成回答
  -> DeepSeek 不可用时使用本地 RAG 兜底回答
```

同义词示例：

| 归一方向 | 覆盖词 |
| --- | --- |
| 离线 | 掉线、断连、心跳超时 |
| 控灯 | 控制、开关灯、开灯、关灯 |
| 光照 | 亮度、照度、传感器 |
| 告警 | 报警、异常、故障 |

## 4. 问答接口

请求：

```http
POST /api/agent/chat
```

```json
{
  "question": "SL-003 掉线后怎么排查？"
}
```

响应：

```json
{
  "answer": "针对 SL-003，设备离线通常与供电、网络、MQTT 连接或设备编号配置有关...",
  "provider": "deepseek",
  "model": "deepseek-v4-flash",
  "references": ["设备离线排查", "MQTT 主题说明"],
  "matches": [
    {
      "id": "kb-offline",
      "title": "设备离线排查",
      "source": "智慧路灯运维知识库 / 设备离线排查",
      "snippet": "设备离线通常与供电、网络、MQTT 连接或设备编号配置有关...",
      "score": 12,
      "keywords": ["离线", "掉线", "心跳"]
    }
  ],
  "suggestedActions": ["检查设备供电和网络连接", "确认 MQTT 客户端在线"]
}
```

`provider=deepseek` 表示本次由 DeepSeek 生成正文；`provider=local` 表示未配置 API Key 或外部请求失败后使用本地 RAG 兜底。DeepSeek 兼容 OpenAI 格式，默认调用 `https://api.deepseek.com/chat/completions`，默认模型为 `deepseek-v4-flash`。模型和 base URL 以 DeepSeek 官方文档为准：https://api-docs.deepseek.com/

环境变量：

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_TIMEOUT_MS=8000
```

## 5. 前端展示

智能问答面板现在展示：

- 问答正文
- 模型来源，显示 `DeepSeek` 或本地检索兜底
- 引用来源标签
- 知识命中卡片
- 推荐操作按钮

## 6. 测试与验收

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| 知识库测试 | `npm --workspace backend test -- knowledgeBase.test.ts` | 覆盖知识库加载、同义词、设备 ID 上下文和问答增强 |
| DeepSeek 接入测试 | `npm --workspace backend test -- deepseekAgent.test.ts` | 覆盖 API Key 配置、请求体、上下文注入和本地兜底 |
| 问答前端测试 | `npm --workspace frontend test -- AgentRagFlow.test.ts` | 覆盖命中片段和推荐操作展示 |
| 后端相关测试 | `npm --workspace backend test -- streetlight.test.ts knowledgeBase.test.ts deepseekAgent.test.ts api.test.ts` | 覆盖故障预判、知识库、DeepSeek 接入和 API 接线 |

## 7. Git 提交与分支情况

| 项目 | 说明 |
| --- | --- |
| 当前分支 | `main` |
| 跟踪远端 | `origin/main` |
| 基准提交 | `9b4e75b docs: update workflow git status` |
| 功能提交 | `feat: add rag fault prediction workflows` |
| 文档提交 | `docs: add rag fault prediction reports` |
| DeepSeek 调整提交 | `feat: use deepseek for rag answers` |
| 远端同步 | 完成提交后推送到 `origin/main` |
