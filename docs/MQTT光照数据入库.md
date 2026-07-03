# MQTT 光照数据入库说明

## 1. 功能目标

MQTT 光照数据入库用于把设备侧上报的光照强度、灯光状态、在线状态和时间戳保存到系统状态层，并在产品化模式下持久化到 MySQL 的 `light_readings` 表中。

该能力是智慧路灯系统实时监控、历史趋势、自动开关灯、离线告警和前端总览刷新的基础。

## 2. 数据流

```text
mock-device
  -> streetlight/{deviceId}/telemetry
  -> EMQX
  -> backend/src/services/mqttBridge.ts
  -> applyTelemetry()
  -> StateStore.update()
  -> MysqlStateStore.writeState()
  -> light_readings
  -> Socket.IO state:update
  -> frontend TrendChart / Overview
```

## 3. 已完成内容

| 模块 | 文件 | 完成内容 |
| --- | --- | --- |
| 模拟设备上报 | `mock-device/src/index.ts` | 每 3 秒发布 4 台设备的光照强度、灯光状态、在线状态和时间戳 |
| MQTT 接收 | `backend/src/services/mqttBridge.ts` | 订阅 `streetlight/+/telemetry`，收到消息后解析遥测数据 |
| 领域处理 | `backend/src/domain/streetlight.ts` | `applyTelemetry()` 更新设备心跳、灯光状态，并追加 `LightReading` |
| 状态抽象 | `backend/src/services/store.ts` | 通过 `StateStore.update()` 统一写入 JSON 或 MySQL 存储 |
| MySQL 入库 | `backend/src/services/mysqlStore.ts` | 创建 `light_readings` 表，并写入 `id`、`device_id`、`light_intensity`、`lamp_status`、`reported_at` |
| API 查询 | `backend/src/routes/api.ts` | 提供 `/api/devices/{id}/latest-light` 和 `/api/devices/{id}/light-history` |
| 前端展示 | `frontend/src/App.vue`、`frontend/src/components/TrendChart.vue` | 总览页和设备详情页展示实时光照与历史趋势 |

## 4. 入库字段

MySQL 表 `light_readings` 用于保存光照历史：

| 字段 | 说明 |
| --- | --- |
| `id` | 光照记录唯一 ID |
| `device_id` | 设备编号，例如 `SL-001` |
| `light_intensity` | 光照强度，单位 lux |
| `lamp_status` | 路灯状态，`ON` 或 `OFF` |
| `reported_at` | 设备上报时间 |

表上已经建立索引：

| 索引 | 说明 |
| --- | --- |
| `idx_readings_device_time` | 支持按设备和时间查询历史光照 |
| `idx_readings_reported_at` | 支持按时间排序和清理历史数据 |

## 5. 入库逻辑

后端收到 MQTT 光照数据后执行以下逻辑：

1. `MqttBridge` 解析 `streetlight/{deviceId}/telemetry` 消息。
2. 调用 `applyTelemetry(state, telemetry)`。
3. 更新设备在线状态、灯光状态、最后心跳时间和更新时间。
4. 向 `state.readings` 追加一条 `LightReading`。
5. 将光照历史按 `reportedAt` 排序，并保留最近 240 条。
6. 继续执行自动控制判断，必要时生成开灯或关灯指令。
7. `StateStore.update()` 将更新后的状态写入当前存储。
8. 当 `STORAGE_DRIVER=mysql` 时，`MysqlStateStore` 在事务内写入 `light_readings` 表。
9. 写入完成后通过 Socket.IO 向前端推送最新总览数据。

## 6. 数据示例

设备 MQTT 上报：

```json
{
  "deviceId": "SL-001",
  "lightIntensity": 88,
  "lampStatus": "OFF",
  "online": true,
  "timestamp": "2026-07-03T02:00:00.000Z"
}
```

入库后的领域对象：

```json
{
  "deviceId": "SL-001",
  "lightIntensity": 88,
  "lampStatus": "OFF",
  "reportedAt": "2026-07-03T02:00:00.000Z"
}
```

## 7. 验收方式

本地测试：

```bash
npm --workspace backend test -- store.test.ts streetlight.test.ts mysqlStore.test.ts
```

测试覆盖点：

- `streetlight.test.ts` 验证 MQTT 遥测进入领域逻辑后会追加光照读数，并触发自动控制判断。
- `store.test.ts` 验证遥测光照数据通过 `StateStore.update()` 后可持久化并重新读取。
- `mysqlStore.test.ts` 在配置 `TEST_DATABASE_URL` 或 `DATABASE_URL` 时，验证遥测光照数据可通过 `MysqlStateStore` 写入并读回。

MySQL 集成测试命令：

```bash
TEST_DATABASE_URL=mysql://streetlight:streetlight_pass@127.0.0.1:3307/smart_streetlight npm --workspace backend test -- mysqlStore.test.ts
```

## 8. Git 提交与分支情况

当前 MQTT 光照数据入库能力已经在主线代码中实现，本次补充测试和说明文档：

| 项目 | 说明 |
| --- | --- |
| 当前分支 | `main` |
| 跟踪远端 | `origin/main` |
| 当前提交 | `b8ae065 feat: complete streetlight control workflow` |
| 相关代码状态 | MQTT 接收、领域入库、MySQL 表结构、API 查询和前端展示已存在于当前主线 |
| 提交状态 | 光照数据持久化测试和说明文档已纳入本地提交 |
| 拉取状态 | 已执行 `git pull --rebase origin main`，远端无新增提交 |
| 远端同步状态 | 本地 `main` 领先 `origin/main` 1 个提交，尚未 push |

分支情况说明：

- 当前开发主线为 `main`，本地最新提交为 `b8ae065 feat: complete streetlight control workflow`。
- 本次没有新建 MQTT 光照入库专项分支，是在当前主线基础上补充测试和过程记录。
- 工程搭建、登录页、MQTT 基础框架和 MQTT 光照数据入库相关改动已随阶段性提交一起记录。
