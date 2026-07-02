<script setup lang="ts">
import * as echarts from "echarts";
import { Download } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Device, LightReading } from "../services/api";

const props = withDefaults(
  defineProps<{
    history: LightReading[];
    deviceId: string;
    devices: Device[];
    compact?: boolean;
  }>(),
  {
    compact: false
  }
);

const emit = defineEmits<{
  "select-device": [deviceId: string];
}>();

const chartEl = ref<HTMLDivElement | null>(null);
const activeRange = ref("24小时");
let chart: echarts.ECharts | null = null;
let frameHandle = 0;

const selectedDeviceName = computed(() => props.devices.find((device) => device.id === props.deviceId)?.name ?? props.deviceId);
const rangeOptions = ["实时", "6小时", "24小时", "7天", "30天"];

function renderChart() {
  if (!chartEl.value) {
    return;
  }
  if (chartEl.value.clientWidth === 0 || chartEl.value.clientHeight === 0) {
    scheduleRender();
    return;
  }
  chart ??= echarts.init(chartEl.value);
  chart.resize();
  chart.setOption({
    animationDuration: 360,
    color: ["#0f8f87"],
    grid: { left: 42, right: 24, top: 22, bottom: 34 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#ffffff",
      borderColor: "#dfe8ea",
      borderWidth: 1,
      textStyle: { color: "#27323a", fontSize: 12 }
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#dfe8ea" } },
      axisLabel: {
        color: "#7b8790",
        fontSize: 11,
        formatter(value: string) {
          return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
        }
      },
      data: props.history.map((item) => item.reportedAt)
    },
    yAxis: {
      type: "value",
      min: 0,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: "#7b8790", fontSize: 11 },
      splitLine: { lineStyle: { color: "#edf2f3", type: "dashed" } }
    },
    series: [
      {
        name: "光照强度",
        type: "line",
        smooth: true,
        symbolSize: 4,
        showSymbol: props.history.length < 40,
        areaStyle: { color: "rgba(15, 143, 135, 0.12)" },
        lineStyle: { width: 2, color: "#0f8f87" },
        itemStyle: { color: "#0f8f87", borderColor: "#ffffff", borderWidth: 2 },
        data: props.history.map((item) => item.lightIntensity)
      }
    ]
  });
}

function scheduleRender() {
  if (frameHandle) {
    cancelAnimationFrame(frameHandle);
  }
  frameHandle = requestAnimationFrame(() => {
    frameHandle = requestAnimationFrame(() => {
      frameHandle = 0;
      renderChart();
    });
  });
}

watch(
  () => [props.history, props.deviceId, props.compact],
  async () => {
    await nextTick();
    scheduleRender();
  },
  { deep: true }
);

onMounted(() => {
  scheduleRender();
  window.addEventListener("resize", scheduleRender);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", scheduleRender);
  if (frameHandle) {
    cancelAnimationFrame(frameHandle);
  }
  chart?.dispose();
});
</script>

<template>
  <section class="panel chart-panel" :class="{ compact }">
    <div class="panel-header chart-header">
      <div>
        <h2>历史光照趋势</h2>
        <p>{{ selectedDeviceName }} 最近数据</p>
      </div>
      <div class="chart-tools">
        <button
          v-for="item in rangeOptions"
          :key="item"
          type="button"
          :class="{ active: activeRange === item }"
          @click="activeRange = item"
        >
          {{ item }}
        </button>
        <select :value="deviceId" @change="emit('select-device', ($event.target as HTMLSelectElement).value)">
          <option v-for="device in devices" :key="device.id" :value="device.id">{{ device.id }}</option>
        </select>
        <span class="unit-label">单位：lux</span>
        <button class="icon-button" type="button" title="下载趋势图"><Download :size="14" /></button>
      </div>
    </div>
    <div ref="chartEl" class="chart-canvas"></div>
  </section>
</template>
