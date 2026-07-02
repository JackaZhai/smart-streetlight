<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import AlarmList from "./components/AlarmList.vue";
import AgentChat from "./components/AgentChat.vue";
import DeviceControl from "./components/DeviceControl.vue";
import DeviceTable from "./components/DeviceTable.vue";
import KpiCard from "./components/KpiCard.vue";
import LoginPanel from "./components/LoginPanel.vue";
import SidebarNav from "./components/SidebarNav.vue";
import TrendChart from "./components/TrendChart.vue";
import {
  connectRealtime,
  fetchLightHistory,
  fetchOverview,
  getStoredSession,
  logout,
  socket,
  type AuthSession,
  type Device,
  type LightReading,
  type Overview,
  type ThresholdConfig
} from "./services/api";

const overview = ref<Overview | null>(null);
const history = ref<LightReading[]>([]);
const selectedDeviceId = ref("SL-001");
const loading = ref(true);
const errorMessage = ref("");
const session = ref<AuthSession | null>(getStoredSession());

const selectedDevice = computed<Device | undefined>(() =>
  overview.value?.devices.find((device) => device.id === selectedDeviceId.value)
);
const selectedThreshold = computed<ThresholdConfig | undefined>(() =>
  overview.value?.thresholds.find((threshold) => threshold.deviceId === selectedDeviceId.value)
);
const latestReading = computed<LightReading | undefined>(() =>
  overview.value?.latestReadings.find((reading) => reading.deviceId === selectedDeviceId.value)
);

async function loadOverview() {
  if (!session.value) {
    loading.value = false;
    return;
  }
  try {
    loading.value = true;
    overview.value = await fetchOverview();
    if (!overview.value.devices.some((device) => device.id === selectedDeviceId.value)) {
      selectedDeviceId.value = overview.value.devices[0]?.id ?? "SL-001";
    }
    await loadHistory();
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function loadHistory() {
  if (!session.value) {
    history.value = [];
    return;
  }
  history.value = await fetchLightHistory(selectedDeviceId.value);
}

watch(selectedDeviceId, () => {
  void loadHistory();
});

async function startAuthenticatedSession(nextSession: AuthSession) {
  session.value = nextSession;
  socket.off("state:update");
  connectRealtime();
  socket.on("state:update", (next: Overview) => {
    overview.value = next;
    void loadHistory();
  });
  await loadOverview();
}

function handleLogout() {
  logout();
  session.value = null;
  overview.value = null;
  history.value = [];
  errorMessage.value = "";
  loading.value = false;
}

onMounted(async () => {
  if (session.value) {
    await startAuthenticatedSession(session.value);
    return;
  }
  loading.value = false;
});
</script>

<template>
  <LoginPanel v-if="!session" @authenticated="startAuthenticatedSession" />
  <div v-else class="app-shell">
    <SidebarNav :username="session.user.username" @logout="handleLogout" />
    <main class="workspace">
      <header class="topbar">
        <div>
          <h1>智慧路灯节能系统</h1>
          <p>端-智-云一体化演示平台</p>
        </div>
        <div class="connection-pill" :class="{ connected: !errorMessage }">
          <span></span>
          {{ errorMessage ? "连接异常" : "实时通道在线" }}
        </div>
      </header>

      <section v-if="overview" class="kpi-grid" aria-label="系统指标">
        <KpiCard label="实时光照" :value="`${overview.stats.averageLight} lux`" note="平均最新光照" tone="teal" />
        <KpiCard label="在线设备" :value="`${overview.stats.onlineDevices}/${overview.stats.deviceTotal}`" note="心跳状态" tone="green" />
        <KpiCard label="今日告警" :value="String(overview.stats.activeAlarms)" note="未处理告警" tone="amber" />
        <KpiCard label="节能状态" value="自动" note="阈值联动启用" tone="slate" />
      </section>

      <section v-if="overview" class="content-grid">
        <TrendChart
          class="trend-panel"
          :history="history"
          :device-id="selectedDeviceId"
          :devices="overview.devices"
          @select-device="selectedDeviceId = $event"
        />
        <DeviceControl
          v-if="selectedDevice && selectedThreshold"
          class="control-panel"
          :device="selectedDevice"
          :threshold="selectedThreshold"
          :latest-reading="latestReading"
          @changed="loadOverview"
        />
      </section>

      <section v-if="overview" class="bottom-grid">
        <DeviceTable
          :devices="overview.devices"
          :selected-device-id="selectedDeviceId"
          @select-device="selectedDeviceId = $event"
        />
        <AlarmList :alarms="overview.alarms" @changed="loadOverview" />
        <AgentChat />
      </section>

      <div v-if="loading" class="empty-state">正在加载智慧路灯运行数据...</div>
      <div v-if="errorMessage" class="error-state">{{ errorMessage }}</div>
    </main>
  </div>
</template>
