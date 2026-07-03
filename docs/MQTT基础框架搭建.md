# MQTT 基础框架搭建说明

## 1. 搭建目标

MQTT 基础框架用于打通“设备侧数据上报 - 后端接收处理 - 控制指令下发 - 设备回执 - 前端实时刷新”的核心链路，为后续接入真实路灯硬件和传感器数据提供基础通信能力。

当前系统采用 EMQX 作为 MQTT Broker，后端通过 `mqtt.js` 接入 Broker，模拟设备通过 `mock-device` 模块模拟真实路灯设备。

整体链路如下：

```text
mock-device -> EMQX MQTT Broker -> backend MqttBridge -> StateStore/业务规则 -> Socket.IO -> frontend
backend -> EMQX MQTT Broker -> mock-device command/reply
```

## 2. 已完成内容

| 模块 | 文件 | 完成内容 |
| --- | --- | --- |
| MQTT Broker | `deploy/docker-compose.yml` | 使用 `emqx/emqx:5` 启动 MQTT Broker，开放 `1883`、`8083`、`18083` 端口 |
| 后端 MQTT 桥接 | `backend/src/services/mqttBridge.ts` | 连接 MQTT、订阅遥测和回执主题、处理设备上报、发布控制指令 |
| 后端服务接入 | `backend/src/server.ts` | 后端启动时创建 `MqttBridge`，并在进程退出时关闭 MQTT 连接 |
| 业务处理 | `backend/src/domain/streetlight.ts` | 遥测入库、自动开关灯判断、离线检测、总览数据刷新 |
| 模拟设备 | `mock-device/src/index.ts` | 模拟 4 台路灯定时上报光照和灯光状态，并订阅控制指令 |
| 主题文档 | `docs/MQTT主题设计.md` | 记录遥测、控制、控制回执三个主题及消息示例 |

## 3. MQTT 主题设计

| Topic | 方向 | 说明 |
| --- | --- | --- |
| `streetlight/{deviceId}/telemetry` | 设备 -> 后端 | 设备上报光照强度、灯光状态、在线状态和时间戳 |
| `streetlight/{deviceId}/command` | 后端 -> 设备 | 后端下发 `TURN_ON`、`TURN_OFF` 控制指令 |
| `streetlight/{deviceId}/command/reply` | 设备 -> 后端 | 设备回传控制指令执行结果 |

设备遥测消息示例：

```json
{
  "deviceId": "SL-001",
  "lightIntensity": 128,
  "lampStatus": "OFF",
  "online": true,
  "timestamp": "2026-07-01T08:00:00.000Z"
}
```

控制指令消息示例：

```json
{
  "deviceId": "SL-001",
  "command": "TURN_ON",
  "source": "manual",
  "timestamp": "2026-07-01T08:00:03.000Z"
}
```

## 4. 后端处理流程

后端 `MqttBridge` 启动后会执行以下流程：

1. 通过 `MQTT_URL` 连接 EMQX。
2. 订阅 `streetlight/+/telemetry` 和 `streetlight/+/command/reply`。
3. 收到遥测数据后调用 `applyTelemetry()` 更新设备状态和光照历史。
4. 如果光照低于或高于阈值，后端自动生成开灯或关灯指令。
5. 自动控制指令通过 `streetlight/{deviceId}/command` 发布给设备。
6. 状态更新后通过 Socket.IO 推送 `state:update` 给前端。
7. 后端定时调用 `markOfflineDevices()`，对心跳超时设备生成离线告警。

## 5. 模拟设备流程

`mock-device` 模块用于在没有真实硬件时模拟设备侧行为：

1. 连接 `MQTT_URL` 指向的 Broker。
2. 订阅 `streetlight/+/command`。
3. 每 3 秒向 `streetlight/{deviceId}/telemetry` 发布 4 台路灯的光照数据。
4. 收到 `TURN_ON` 或 `TURN_OFF` 后更新本地灯光状态。
5. 向 `streetlight/{deviceId}/command/reply` 发布执行成功回执。

## 6. 环境与启动方式

本地开发默认 MQTT 地址：

```env
MQTT_URL=mqtt://127.0.0.1:1883
```

Docker Compose 部署中后端连接容器内 EMQX：

```env
MQTT_URL=mqtt://emqx:1883
```

启动基础设施：

```bash
docker compose -f deploy/docker-compose.yml up -d emqx
```

启动后端：

```bash
npm run dev:backend
```

启动模拟设备：

```bash
MQTT_URL=mqtt://127.0.0.1:1883 npm run dev:mock
```

## 7. 验收方式

MQTT 基础框架可通过以下方式验收：

```bash
npm --workspace backend test -- streetlight.test.ts
npm --workspace mock-device run build
docker compose -f deploy/docker-compose.yml config
```

联调验收步骤：

1. 启动 EMQX。
2. 启动后端服务。
3. 启动 `mock-device`。
4. 登录前端后查看总览页。
5. 确认设备在线数、实时光照、历史趋势随模拟设备上报变化。
6. 点击开灯或关灯，确认后端向 MQTT 发布控制指令。
7. 模拟设备收到指令后发布 `command/reply` 回执。

## 8. Git 提交与分支情况

当前 MQTT 基础框架已经合入主线代码，当前记录基于主分支整理：

| 项目 | 说明 |
| --- | --- |
| 当前分支 | `main` |
| 跟踪远端 | `origin/main` |
| 当前提交 | `b8ae065 feat: complete streetlight control workflow` |
| MQTT 相关代码状态 | MQTT 桥接、EMQX、模拟设备和主题文档已存在于当前主线 |
| 提交状态 | 本文档和 MQTT 基础框架记录已纳入本地提交 |
| 拉取状态 | 已执行 `git pull --rebase origin main`，远端无新增提交 |
| 远端同步状态 | 本地 `main` 领先 `origin/main` 1 个提交，尚未 push |

分支情况说明：

- 当前开发主线为 `main`，本地最新提交为 `b8ae065 feat: complete streetlight control workflow`。
- 之前功能分支已经合并到主线，MQTT 基础链路属于项目初稿和后续主线迭代中的核心基础能力。
- 本次没有新建 MQTT 专项分支，当前是在已有主线基础上补充 MQTT 搭建说明和验收记录，并已随阶段性提交一起记录。
