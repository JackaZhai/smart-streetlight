<script setup lang="ts">
import { CircleDot, Search } from "lucide-vue-next";
import type { Device, FaultPrediction, FaultRiskLevel, LightReading } from "../services/api";

const props = withDefaults(
  defineProps<{
    devices: Device[];
    selectedDeviceId: string;
    latestReadings?: LightReading[];
    faultPredictions?: FaultPrediction[];
    compact?: boolean;
  }>(),
  {
    latestReadings: () => [],
    faultPredictions: () => [],
    compact: false
  }
);

const emit = defineEmits<{
  "select-device": [deviceId: string];
  "open-detail": [deviceId: string];
}>();

function latestReadingFor(deviceId: string) {
  return props.latestReadings.find((reading) => reading.deviceId === deviceId);
}

function currentPower(device: Device) {
  if (device.lampStatus !== "ON") {
    return 0;
  }
  return device.id.endsWith("2") ? 58 : 62;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
}

function highestRiskFor(deviceId: string) {
  return props.faultPredictions.find((risk) => risk.deviceId === deviceId);
}

function riskLevelText(level?: FaultRiskLevel) {
  if (!level) {
    return "正常";
  }
  return {
    LOW: "低风险",
    MEDIUM: "中风险",
    HIGH: "高风险"
  }[level];
}
</script>

<template>
  <section class="panel table-panel" :class="{ compact }">
    <div class="panel-header compact">
      <div>
        <h2>设备列表</h2>
        <p>共 {{ devices.length }} 条</p>
      </div>
      <div v-if="compact" class="mini-table-tools">
        <span><Search :size="13" /> 搜索设备ID / 位置</span>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>设备ID</th>
            <th>在线状态</th>
            <th>灯具状态</th>
            <th>当前功率</th>
            <th>今日能耗</th>
            <th>位置</th>
            <th>最后心跳</th>
            <th>故障预判</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="device in devices"
            :key="device.id"
            :class="{ selected: device.id === selectedDeviceId }"
            @click="emit('select-device', device.id)"
          >
            <td>
              <strong>{{ device.id }}</strong>
              <span>{{ device.name }}</span>
            </td>
            <td>
              <span class="status-badge" :class="device.onlineStatus === 'ONLINE' ? 'online' : 'offline'">
                <CircleDot :size="12" /> {{ device.onlineStatus === "ONLINE" ? "在线" : "离线" }}
              </span>
            </td>
            <td>
              <span class="state-pill" :class="{ on: device.lampStatus === 'ON' }">{{ device.lampStatus }}</span>
            </td>
            <td>{{ currentPower(device) }} W</td>
            <td>{{ device.lampStatus === "ON" ? (currentPower(device) / 100).toFixed(2) : "0.00" }} kWh</td>
            <td>{{ device.location }}</td>
            <td>{{ formatDateTime(latestReadingFor(device.id)?.reportedAt ?? device.lastHeartbeatAt) }}</td>
            <td>
              <span class="risk-pill" :class="highestRiskFor(device.id)?.riskLevel.toLowerCase()">
                {{ riskLevelText(highestRiskFor(device.id)?.riskLevel) }}
              </span>
            </td>
            <td>
              <button class="text-button" type="button" @click.stop="emit('open-detail', device.id)">详情</button>
              <button class="text-button" type="button" @click.stop="emit('open-detail', device.id)">控制</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
