<script setup lang="ts">
import * as echarts from "echarts";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Device, LightReading } from "../services/api";

const props = defineProps<{
  history: LightReading[];
  deviceId: string;
  devices: Device[];
}>();

const emit = defineEmits<{
  "select-device": [deviceId: string];
}>();

const chartEl = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;

const selectedDeviceName = computed(() => props.devices.find((device) => device.id === props.deviceId)?.name ?? props.deviceId);

function renderChart() {
  if (!chartEl.value) {
    return;
  }
  chart ??= echarts.init(chartEl.value);
  chart.setOption({
    animationDuration: 400,
    grid: { left: 42, right: 18, top: 30, bottom: 34 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      boundaryGap: false,
      axisLine: { lineStyle: { color: "#d7dee8" } },
      axisLabel: {
        color: "#6b7280",
        formatter(value: string) {
          return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
        }
      },
      data: props.history.map((item) => item.reportedAt)
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#6b7280" },
      splitLine: { lineStyle: { color: "#edf1f5" } }
    },
    series: [
      {
        name: "光照强度",
        type: "line",
        smooth: true,
        symbolSize: 5,
        areaStyle: { color: "rgba(20, 184, 166, 0.12)" },
        lineStyle: { width: 3, color: "#0f766e" },
        itemStyle: { color: "#0f766e" },
        data: props.history.map((item) => item.lightIntensity)
      }
    ]
  });
}

watch(
  () => [props.history, props.deviceId],
  async () => {
    await nextTick();
    renderChart();
  },
  { deep: true }
);

onMounted(() => {
  renderChart();
  window.addEventListener("resize", renderChart);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", renderChart);
  chart?.dispose();
});
</script>

<template>
  <section class="panel chart-panel">
    <div class="panel-header">
      <div>
        <h2>历史光照趋势</h2>
        <p>{{ selectedDeviceName }} 最近数据</p>
      </div>
      <select :value="deviceId" @change="emit('select-device', ($event.target as HTMLSelectElement).value)">
        <option v-for="device in devices" :key="device.id" :value="device.id">{{ device.name }}</option>
      </select>
    </div>
    <div ref="chartEl" class="chart-canvas"></div>
  </section>
</template>
