# 智慧路灯节能系统

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
- 数据：MySQL 8 产品化持久化，JSON 文件作为本地开发兜底

## 目录结构

```text
smart-streetlight/
├── frontend/       # 前端大屏和管理界面
├── backend/        # REST API、Socket.IO、MQTT、告警、控制逻辑
├── mock-device/    # 模拟光照传感器和路灯设备
├── deploy/         # 全栈 Docker Compose
└── docs/           # 需求、架构、接口、MQTT、测试记录
```

## 一键部署

生产化交付优先使用 Docker Compose：

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

默认访问：

- 前端：http://localhost:18080
- 后端健康检查：http://localhost:4000/health
- EMQX 控制台：http://localhost:18083
- MySQL：127.0.0.1:3307，数据库 `smart_streetlight`

默认管理员账号用于演示交付：

```text
admin / admin123
```

正式部署前应通过 `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`JWT_SECRET` 和 `AUTH_USERS_JSON` 修改认证配置。

停止服务：

```bash
docker compose -f deploy/docker-compose.yml down
```

详细部署和验收步骤见 [docs/部署说明.md](docs/部署说明.md)。

## 开发启动

1. 安装依赖：

```bash
npm install
```

2. 复制环境变量示例：

```bash
cp .env.example .env
```

3. 启动基础设施：

```bash
docker compose -f deploy/docker-compose.yml up -d emqx mysql
```

4. 启动后端：

```bash
npm run dev:backend
```

5. 启动前端：

```bash
npm run dev:frontend
```

6. 启动模拟设备：

```bash
npm run dev:mock
```

默认访问：

- 前端：http://localhost:5173
- 后端健康检查：http://localhost:4000/health
- EMQX 控制台：http://localhost:18083
- MySQL：127.0.0.1:3307，数据库 `smart_streetlight`

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
npm run typecheck
npm run build
```

## 数据备份与恢复

生产化运行使用 MySQL 后，可以通过内置运维脚本备份和恢复数据库：

```bash
npm run db:backup
npm run db:restore -- --input backups/mysql/smart-streetlight-YYYYMMDD-HHMMSS.sql --yes
```

恢复操作会覆盖当前数据库，脚本要求显式传入 `--yes`。上线前应将 `backups/mysql/` 同步到服务器外部存储或客户指定备份位置。

## 存储配置

默认产品化运行使用 MySQL：

```env
STORAGE_DRIVER=mysql
DATABASE_URL=mysql://streetlight:streetlight_pass@127.0.0.1:3307/smart_streetlight
```

后端启动时会自动建表，并在空库中写入初始路灯、阈值、历史光照和示例告警。若只需要本地快速调试，可以设置：

```env
STORAGE_DRIVER=json
STATE_FILE=./data/state.json
```

## 登录配置

后端默认开启管理员登录，并支持通过 JSON 配置运维员和只读账号：

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
JWT_SECRET=change-this-secret-before-delivery
AUTH_TOKEN_TTL_SECONDS=86400
AUTH_USERS_JSON=[{"username":"operator","password":"operator123","role":"operator"},{"username":"viewer","password":"viewer123","role":"viewer"}]
```

除 `/health` 和 `/api/auth/login` 外，所有 `/api` 接口和 Socket.IO 连接都需要登录 token。

角色权限：

- `admin`：全部读写权限，可新增设备、查看审计日志。
- `operator`：可执行阈值调整、开关灯、告警处理等运维操作。
- `viewer`：只读访问总览、设备、告警和智能问答。

关键写操作和被拒绝的越权操作会写入审计日志，管理员可在前端审计面板或 `/api/audit-logs` 查看最近记录。

## 后续扩展

- 将本地规则问答替换为 MaxKB/RAG 智能体。
- 基地阶段接入鸿蒙开发板真实光照传感器和控制外设。
- 增加告警通知、备份恢复和 CI/CD 发布流水线。
