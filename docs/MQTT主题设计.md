# MQTT 主题设计

| Topic | 方向 | 说明 |
| --- | --- | --- |
| `streetlight/{deviceId}/telemetry` | 设备 -> 云端 | 上报光照、路灯状态、心跳 |
| `streetlight/{deviceId}/command` | 云端 -> 设备 | 下发开灯、关灯指令 |
| `streetlight/{deviceId}/command/reply` | 设备 -> 云端 | 回传控制指令执行结果 |

## 设备上报示例

```json
{
  "deviceId": "SL-001",
  "lightIntensity": 128,
  "lampStatus": "OFF",
  "online": true,
  "timestamp": "2026-07-01T08:00:00.000Z"
}
```

## 控制指令示例

```json
{
  "commandId": "control-xxxx",
  "deviceId": "SL-001",
  "command": "TURN_ON",
  "source": "manual",
  "attempt": 1,
  "maxAttempts": 3,
  "timestamp": "2026-07-01T08:00:03.000Z"
}
```

## 控制回执示例

```json
{
  "commandId": "control-xxxx",
  "deviceId": "SL-001",
  "command": "TURN_ON",
  "result": "SUCCESS",
  "timestamp": "2026-07-01T08:00:04.000Z"
}
```
