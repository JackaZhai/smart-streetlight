# MySQL Storage Upgrade Design

## Goal

将智慧路灯系统的数据层从本地 JSON 文件升级为 MySQL 8 持久化存储，使当前初稿向产品级方向推进，同时保持现有 REST API、MQTT 联动、Socket.IO 实时推送和模拟设备链路可运行。

## Current State

当前后端通过 `JsonStateStore` 维护完整 `AppState`，启动后从 `STATE_FILE` 读取 JSON，写入时整体序列化到本地文件。这个方案适合演示初稿，但不适合产品级使用，主要问题是并发写入能力弱、数据查询能力有限、历史记录不可控、部署迁移不清晰。

领域逻辑已经集中在 `backend/src/domain/streetlight.ts`，包括遥测处理、阈值控制、离线告警、手动控制和总览统计。MySQL 改造应保持这些领域函数的输入输出稳定，优先替换存储层，不重写业务规则。

## Selected Approach

采用 `mysql2/promise` + 明确 SQL 的方式实现 MySQL 存储，不引入 ORM。

原因：

- 当前数据模型简单，显式 SQL 更容易解释、排错和答辩。
- 迁移成本低，不需要引入 Prisma schema、代码生成和额外运行时流程。
- Spark 远端部署可以直接用 MySQL 8 Docker 容器完成验证。
- 保留未来升级到 ORM 或迁移工具的空间。

## Architecture

新增一个存储接口，让 API、MQTT bridge 和 Socket.IO 只依赖抽象能力，而不依赖 JSON 或 MySQL 的具体实现。

```text
REST API / MQTT Bridge / Socket.IO
              |
          StateStore
        /            \
JsonStateStore   MysqlStateStore
        |            |
   local JSON     MySQL 8 tables
```

后端启动时根据环境变量选择存储实现：

- `STORAGE_DRIVER=mysql`：使用 MySQL，作为产品级默认目标。
- `STORAGE_DRIVER=json` 或未配置 `DATABASE_URL`：使用 JSON，保留本地快速开发兜底。

## Data Model

MySQL 侧按业务实体拆表：

| Table | Purpose |
| --- | --- |
| `devices` | 路灯设备基础信息、在线状态、灯状态、自动模式和心跳时间 |
| `threshold_configs` | 每台设备的低光照/高光照阈值和启用状态 |
| `light_readings` | 光照遥测历史，保留最近记录用于趋势展示 |
| `alarm_logs` | 离线、传感器异常、控制超时等告警 |
| `control_logs` | 手动/自动控制指令下发记录 |

时间字段统一保存为 MySQL `DATETIME(3)`，后端读出后转换为 ISO 字符串，保持前端和 API 响应格式不变。

关键约束：

- `devices.id` 为主键。
- `threshold_configs.device_id` 为主键，并关联 `devices.id`。
- `light_readings.device_id`、`alarm_logs.device_id`、`control_logs.device_id` 建索引。
- `alarm_logs.handled` 建索引，便于查询未处理告警。
- `light_readings.reported_at` 建索引，便于按时间排序和清理历史。

## Initialization And Migration

后端启动时执行轻量初始化：

1. 建库由 Docker Compose 的 `MYSQL_DATABASE` 完成。
2. 后端连接 MySQL 后执行 `CREATE TABLE IF NOT EXISTS`。
3. 若 `devices` 表为空，写入 `createSeedState()` 生成的初始设备、阈值、遥测和示例告警。
4. 若表已有数据，不重复 seed。

这不是长期生产迁移系统，但足够支撑当前产品级初稿。后续如果多人协作或版本升级频繁，再引入独立 migration 工具。

## Store Contract

存储接口保持现有调用模型：

```ts
type StateUpdater = (state: AppState) => AppState | Promise<AppState>;

interface StateStore {
  getState(): Promise<AppState>;
  update(updater: StateUpdater): Promise<AppState>;
  close?(): Promise<void>;
}
```

`MysqlStateStore.update()` 采用事务：

1. 读取当前完整状态。
2. 执行业务 updater。
3. 将更新后的状态写回对应表。
4. 提交事务并返回最新状态。

当前系统状态规模小，完整状态读写足以满足初稿和演示。为了防止历史数据无限增长，写回时只保留最近 240 条 `light_readings`，与现有领域逻辑的 `HISTORY_LIMIT` 一致。

## Deployment

`deploy/docker-compose.yml` 增加 MySQL 8 服务：

- 镜像：`mysql:8.4` 或国内镜像可拉取的等价 MySQL 8 版本。
- 端口：宿主机 `3307` 映射容器 `3306`，避免占用常见本地 MySQL 端口。
- 数据卷：`mysql-data`。
- 初始化环境：
  - `MYSQL_DATABASE=smart_streetlight`
  - `MYSQL_USER=streetlight`
  - `MYSQL_PASSWORD=streetlight_pass`
  - `MYSQL_ROOT_PASSWORD=streetlight_root_pass`

后端 `.env.example` 增加：

```env
STORAGE_DRIVER=mysql
DATABASE_URL=mysql://streetlight:streetlight_pass@127.0.0.1:3307/smart_streetlight
```

Spark 远端使用同一 compose 管理 EMQX 和 MySQL。后端运行在宿主机时连接 `127.0.0.1:3307`。

## API And Frontend Compatibility

本次改造不改变现有 API 路径和响应结构：

- `/health`
- `/api/overview`
- `/api/devices`
- `/api/devices/:id`
- `/api/devices/:id/light-history`
- `/api/devices/:id/threshold`
- `/api/alarms`
- `/api/agent/chat`

前端无需感知存储后端变化。

## Error Handling

- MySQL 连接失败时，后端启动应直接报错并退出，避免以为服务正常但数据不可写。
- `/health` 增加存储状态检查，返回当前 storage driver。
- SQL 初始化失败时输出明确日志，包括数据库主机、库名和失败阶段，不打印密码。
- 事务写入失败时回滚，并让 API 返回 500。

## Testing Strategy

测试分三层：

1. 现有领域逻辑测试继续保留，确保业务规则不因存储替换变化。
2. 新增存储契约测试，使用 JSON store 验证接口行为，确保 `getState()`、`update()` 和 seed 逻辑稳定。
3. 新增 MySQL store 集成测试，只有在提供 `DATABASE_URL` 时运行，避免本地无 MySQL 时阻塞普通测试。

远端 Spark 验证：

```bash
npm test
npm run typecheck
npm run build
docker compose -f deploy/docker-compose.yml up -d
STORAGE_DRIVER=mysql DATABASE_URL=mysql://streetlight:streetlight_pass@127.0.0.1:3307/smart_streetlight npm --workspace backend run dev
MQTT_URL=mqtt://127.0.0.1:1883 npm --workspace mock-device run dev
```

验收时需要看到：

- MySQL 容器运行正常。
- 后端 `/health` 正常并显示 `storageDriver=mysql`。
- mock-device 遥测进入 MySQL。
- `/api/overview` 能返回在线设备、最新光照和告警。
- 重启后端后数据仍存在。

## Non-Goals

本次不做以下内容：

- 登录鉴权和角色权限。
- 管理后台用户体系。
- Prisma/TypeORM 等 ORM 接入。
- 数据库版本迁移工具链。
- MySQL 主从、备份、监控告警。
- 前端大规模改版。

这些能力可以作为下一阶段产品化任务推进。

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Spark 拉取 MySQL 镜像失败 | 使用固定 MySQL 8 版本，并准备国内镜像别名拉取后重新 tag |
| JSON 与 MySQL 行为不一致 | 用存储契约测试约束两种 store 的核心行为 |
| 后端更新时并发覆盖 | 当前演示规模接受完整状态事务写回；后续按实体级 repository 优化 |
| 历史遥测膨胀 | 写回时保留最近 240 条，与当前领域逻辑一致 |
| 密码误提交 | 只提交 `.env.example`，真实 `.env` 不入库 |

## Acceptance Criteria

- 代码中存在清晰的 `StateStore` 抽象。
- JSON store 仍可用于本地开发。
- MySQL store 能完成建表、seed、读取、更新和关闭连接。
- Docker Compose 能同时启动 EMQX 和 MySQL。
- README 和测试记录说明 MySQL 启动方式。
- 本地或 Spark 上通过 `npm test`、`npm run typecheck`、`npm run build`。
- Spark 上完成 MySQL + EMQX + 后端 + mock-device 的端到端验证。
