# 智慧路灯节能系统 Demo

这是“智慧路灯节能系统”的整体代码初稿，覆盖校内软件阶段需要演示的主链路：

```text
Mock 设备 -> MQTT -> 后端 API/告警/控制 -> Socket.IO -> 前端大屏/管理端 -> 智能问答
```

## 技术栈

- 前端：Vue 3 + Vite + TypeScript + ECharts
- 后端：Node.js + Express + TypeScript + Socket.IO
- MQTT：EMQX + mqtt.js
- 模拟设备：Node.js + mqtt.js
- 测试：Vitest
- 数据：本地 JSON 文件持久化，后续可替换为 MySQL/PostgreSQL

## 目录结构

```text
smart-streetlight-demo/
├── frontend/       # 前端大屏和管理界面
├── backend/        # REST API、Socket.IO、MQTT、告警、控制逻辑
├── mock-device/    # 模拟光照传感器和路灯设备
├── deploy/         # EMQX Docker Compose
└── docs/           # 需求、架构、接口、MQTT、测试记录
```

## 本地启动

1. 安装依赖：

```bash
npm install
```

2. 启动 MQTT broker：

```bash
docker compose -f deploy/docker-compose.yml up -d
```

3. 启动后端：

```bash
npm run dev:backend
```

4. 启动前端：

```bash
npm run dev:frontend
```

5. 启动模拟设备：

```bash
npm run dev:mock
```

默认访问：

- 前端：http://localhost:5173
- 后端健康检查：http://localhost:4000/health
- EMQX 控制台：http://localhost:18083

## 核心演示流程

1. 前端总览页查看实时光照、设备在线数、告警数和历史趋势。
2. 启动 mock-device 后，模拟设备定时通过 MQTT 上报光照和心跳。
3. 后端接收遥测数据，按阈值自动生成开灯/关灯指令。
4. 前端通过 Socket.IO 自动刷新设备状态和图表。
5. 在设备控制面板手动开灯/关灯，并更新阈值。
6. 停止 mock-device 后，后端会根据心跳超时生成离线告警。
7. 在智能问答区输入维护问题，获取本地规则问答建议。

## 验证命令

```bash
npm test
npm run build
```

## 后续扩展

- 将 JSON 文件存储替换为 MySQL 或 PostgreSQL。
- 将本地规则问答替换为 MaxKB/RAG 智能体。
- 基地阶段接入鸿蒙开发板真实光照传感器和控制外设。
- 增加登录鉴权、角色权限和正式告警通知。
