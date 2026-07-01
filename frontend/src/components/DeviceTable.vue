<script setup lang="ts">
import { CircleDot } from "lucide-vue-next";
import type { Device } from "../services/api";

defineProps<{
  devices: Device[];
  selectedDeviceId: string;
}>();

const emit = defineEmits<{
  "select-device": [deviceId: string];
}>();
</script>

<template>
  <section class="panel table-panel">
    <div class="panel-header">
      <div>
        <h2>路灯设备</h2>
        <p>点位、在线状态与控制状态</p>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>设备</th>
            <th>位置</th>
            <th>在线</th>
            <th>路灯</th>
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
            <td>{{ device.location }}</td>
            <td>
              <span class="status-badge" :class="device.onlineStatus === 'ONLINE' ? 'online' : 'offline'">
                <CircleDot :size="13" /> {{ device.onlineStatus === "ONLINE" ? "在线" : "离线" }}
              </span>
            </td>
            <td>{{ device.lampStatus === "ON" ? "开启" : "关闭" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
