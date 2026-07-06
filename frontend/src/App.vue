<script setup lang="ts">
import {
  Bell,
  CalendarDays,
  ChevronDown,
  Clock3,
  FileText,
  ListFilter,
  Menu,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound
} from "lucide-vue-next";
import { computed, onMounted, reactive, ref, watch } from "vue";
import AlarmList from "./components/AlarmList.vue";
import AgentChat from "./components/AgentChat.vue";
import DeviceControl from "./components/DeviceControl.vue";
import DeviceTable from "./components/DeviceTable.vue";
import KpiCard from "./components/KpiCard.vue";
import LoginPanel from "./components/LoginPanel.vue";
import SidebarNav from "./components/SidebarNav.vue";
import StreetlightVisual from "./components/StreetlightVisual.vue";
import TrendChart from "./components/TrendChart.vue";
import {
  connectRealtime,
  createDevice,
  fetchAuditLogs,
  fetchLightHistory,
  fetchOverview,
  getStoredSession,
  handleAlarm,
  logout,
  saveThreshold,
  sendRegionCommand,
  socket,
  type AlarmLog,
  type AuditLog,
  type AuthSession,
  type CommandName,
  type Device,
  type FaultPrediction,
  type FaultRiskLevel,
  type LightReading,
  type Overview,
  type ThresholdConfig
} from "./services/api";

type DashboardSection = "overview" | "gis" | "monitor" | "history" | "devices" | "alarms" | "rules" | "agent";
type DeviceView = "list" | "detail";
type AlarmLevelFilter = "ALL" | AlarmLog["alarmLevel"];
type AlarmStatusFilter = "ALL" | "PENDING" | "HANDLED";

const overview = ref<Overview | null>(null);
const history = ref<LightReading[]>([]);
const auditLogs = ref<AuditLog[]>([]);
const selectedDeviceId = ref("SL-001");
const activeSection = ref<DashboardSection>("overview");
const deviceView = ref<DeviceView>("list");
const deviceSearch = ref("");
const deviceStatusFilter = ref<"ALL" | "ONLINE" | "OFFLINE">("ALL");
const alarmLevelFilter = ref<AlarmLevelFilter>("ALL");
const alarmStatusFilter = ref<AlarmStatusFilter>("ALL");
const alarmDeviceKeyword = ref("");
const alarmStartDate = ref("");
const alarmEndDate = ref("");
const selectedAlarmId = ref("");
const alarmHandleRemark = ref("");
const alarmHandlePending = ref(false);
const alarmHandleError = ref("");
const regionCommandPending = ref(false);
const regionCommandError = ref("");
const regionCommandMessage = ref("");
const historyDate = ref(new Date().toISOString().slice(0, 10));
const thresholdPreviewLight = ref(180);
const showCreateDevice = ref(false);
const createDevicePending = ref(false);
const createDeviceError = ref("");
const loading = ref(true);
const errorMessage = ref("");
const session = ref<AuthSession | null>(getStoredSession());

const createDeviceForm = reactive({
  id: "",
  name: "",
  location: ""
});

const ruleForm = reactive({
  lowThreshold: 150,
  highThreshold: 80,
  enabled: true
});

const regionCommandForm = reactive({
  region: "宿舍区",
  command: "TURN_ON" as CommandName
});

const selectedDevice = computed<Device | undefined>(() =>
  overview.value?.devices.find((device) => device.id === selectedDeviceId.value)
);
const selectedThreshold = computed<ThresholdConfig | undefined>(() =>
  overview.value?.thresholds.find((threshold) => threshold.deviceId === selectedDeviceId.value)
);
const latestReading = computed<LightReading | undefined>(() =>
  overview.value?.latestReadings.find((reading) => reading.deviceId === selectedDeviceId.value)
);
const selectedAlarm = computed<AlarmLog | undefined>(() => {
  const alarms = filteredAlarms.value;
  const selected = alarms.find((alarm) => alarm.id === selectedAlarmId.value);
  if (selected) {
    return selected;
  }
  return alarms.find((alarm) => !alarm.handled) ?? alarms[0];
});
const selectedFaultPredictions = computed(() => faultPredictionsFor(selectedDeviceId.value));
const canOperate = computed(() => session.value?.user.role === "admin" || session.value?.user.role === "operator");
const canViewAudit = computed(() => session.value?.user.role === "admin");
const canCreateDevice = computed(() => session.value?.user.role === "admin");
const displayTime = "2025-05-24 10:32:18";

const pageTitle = computed(() => {
  if (activeSection.value === "devices" && deviceView.value === "detail") {
    return `设备详情（${selectedDeviceId.value}）`;
  }
  return {
    overview: "智慧路灯节能系统",
    gis: "区域管控",
    monitor: "光照实时监测",
    history: "历史光照趋势",
    devices: "设备台账",
    alarms: "告警日志",
    rules: "阈值规则",
    agent: "智能问答"
  }[activeSection.value];
});

const alarmStats = computed(() => {
  const alarms = overview.value?.alarms ?? [];
  return {
    pending: alarms.filter((alarm) => !alarm.handled).length,
    warning: alarms.filter((alarm) => alarm.alarmLevel === "WARN" && !alarm.handled).length,
    resolved: alarms.filter((alarm) => alarm.handled).length,
    critical: alarms.filter((alarm) => alarm.alarmLevel === "CRITICAL" && !alarm.handled).length
  };
});

const filteredDevices = computed(() => {
  const keyword = deviceSearch.value.trim().toLowerCase();
  return (overview.value?.devices ?? []).filter((device) => {
    const matchesStatus = deviceStatusFilter.value === "ALL" || device.onlineStatus === deviceStatusFilter.value;
    const matchesKeyword =
      keyword.length === 0 ||
      device.id.toLowerCase().includes(keyword) ||
      device.name.toLowerCase().includes(keyword) ||
      device.location.toLowerCase().includes(keyword);
    return matchesStatus && matchesKeyword;
  });
});

const regionOptions = computed(() => [...new Set((overview.value?.devices ?? []).map((device) => device.location))]);

const regionMatchedDevices = computed(() => {
  const keyword = regionCommandForm.region.trim().toLowerCase();
  const devices = overview.value?.devices ?? [];
  if (!keyword) {
    return devices;
  }
  return devices.filter(
    (device) =>
      device.location.toLowerCase().includes(keyword) ||
      device.name.toLowerCase().includes(keyword) ||
      device.id.toLowerCase().includes(keyword)
  );
});

const monitorLightPercent = computed(() => {
  const value = latestReading.value?.lightIntensity ?? 0;
  return Math.min(100, Math.max(0, Math.round((value / 500) * 100)));
});

const historyRows = computed(() =>
  history.value.slice(-12).map((reading) => ({
    ...reading,
    time: formatDateTime(reading.reportedAt),
    power: reading.lampStatus === "ON" ? "62 W" : "0 W"
  }))
);

const historySummary = computed(() => {
  const values = history.value.map((reading) => reading.lightIntensity);
  if (values.length === 0) {
    return {
      average: 0,
      max: 0,
      min: 0,
      samples: 0
    };
  }
  return {
    average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    max: Math.max(...values),
    min: Math.min(...values),
    samples: values.length
  };
});

const thresholdPreviewStatus = computed(() => {
  if (thresholdPreviewLight.value <= ruleForm.lowThreshold) {
    return "开灯中";
  }
  if (thresholdPreviewLight.value >= ruleForm.highThreshold) {
    return "关灯中";
  }
  return "保持状态";
});

const thresholdPreviewClass = computed(() => {
  if (thresholdPreviewStatus.value === "开灯中") {
    return "on";
  }
  if (thresholdPreviewStatus.value === "关灯中") {
    return "off";
  }
  return "hold";
});

const thresholdPreviewHint = computed(() => {
  if (thresholdPreviewStatus.value === "开灯中") {
    return `当前光照低于 ${ruleForm.lowThreshold} lux，自动触发开灯。`;
  }
  if (thresholdPreviewStatus.value === "关灯中") {
    return `当前光照高于 ${ruleForm.highThreshold} lux，自动触发关灯。`;
  }
  return `当前光照位于 ${ruleForm.lowThreshold}-${ruleForm.highThreshold} lux 区间，保持原状态。`;
});

const filteredAlarms = computed(() => {
  const keyword = alarmDeviceKeyword.value.trim().toLowerCase();
  return (overview.value?.alarms ?? []).filter((alarm) => {
    const matchesLevel = alarmLevelFilter.value === "ALL" || alarm.alarmLevel === alarmLevelFilter.value;
    const matchesStatus =
      alarmStatusFilter.value === "ALL" ||
      (alarmStatusFilter.value === "PENDING" && !alarm.handled) ||
      (alarmStatusFilter.value === "HANDLED" && alarm.handled);
    const matchesDevice =
      keyword.length === 0 ||
      alarm.deviceId.toLowerCase().includes(keyword) ||
      deviceLocationFor(alarm.deviceId).toLowerCase().includes(keyword);
    const createdAt = alarm.createdAt.slice(0, 10);
    const matchesStart = !alarmStartDate.value || createdAt >= alarmStartDate.value;
    const matchesEnd = !alarmEndDate.value || createdAt <= alarmEndDate.value;
    return matchesLevel && matchesStatus && matchesDevice && matchesStart && matchesEnd;
  });
});

const controlRecordRows = computed(() => {
  const rows = auditLogs.value
    .filter((log) => log.action === "command.dispatch" && log.targetId === selectedDeviceId.value)
    .slice(0, 4)
    .map((log) => ({
      time: formatDateTime(log.createdAt),
      action: log.detail?.includes("TURN_OFF") ? "关灯" : "开灯",
      actor: log.actorUsername,
      result: log.result === "SUCCESS" ? "执行成功" : "执行失败"
    }));
  if (rows.length > 0) {
    return rows;
  }
  return [
    { time: "2025-05-24 08:00:00", action: "开灯", actor: "系统自动", result: "执行成功" },
    { time: "2025-05-24 06:10:00", action: "关灯", actor: "系统自动", result: "执行成功" },
    { time: "2025-05-23 18:45:00", action: "开灯", actor: "系统自动", result: "执行成功" },
    { time: "2025-05-23 06:05:00", action: "关灯", actor: "系统自动", result: "执行成功" }
  ];
});

watch(
  selectedThreshold,
  (threshold) => {
    if (!threshold) {
      return;
    }
    ruleForm.lowThreshold = threshold.lowThreshold;
    ruleForm.highThreshold = threshold.highThreshold;
    ruleForm.enabled = threshold.enabled;
  },
  { immediate: true }
);

watch(showCreateDevice, (visible) => {
  if (!visible) {
    return;
  }
  createDeviceForm.id = nextDeviceId();
  createDeviceForm.name = "";
  createDeviceForm.location = "";
  createDeviceError.value = "";
});

watch(
  filteredAlarms,
  (alarms) => {
    if (alarms.length === 0) {
      selectedAlarmId.value = "";
      alarmHandleRemark.value = "";
      return;
    }
    if (!alarms.some((alarm) => alarm.id === selectedAlarmId.value)) {
      selectAlarm(alarms.find((alarm) => !alarm.handled)?.id ?? alarms[0].id);
    }
  },
  { immediate: true }
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
    await loadAuditLogs();
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function loadAuditLogs() {
  if (!canViewAudit.value) {
    auditLogs.value = [];
    return;
  }
  auditLogs.value = await fetchAuditLogs();
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
    void loadAuditLogs();
  });
  await loadOverview();
}

function handleLogout() {
  logout();
  session.value = null;
  overview.value = null;
  history.value = [];
  auditLogs.value = [];
  errorMessage.value = "";
  loading.value = false;
}

function handleNavigate(section: DashboardSection) {
  activeSection.value = section;
  if (section === "devices") {
    deviceView.value = "list";
  }
}

function openDeviceDetail(deviceId: string) {
  selectedDeviceId.value = deviceId;
  activeSection.value = "devices";
  deviceView.value = "detail";
}

function selectAlarm(alarmId: string) {
  selectedAlarmId.value = alarmId;
  const alarm = overview.value?.alarms.find((item) => item.id === alarmId);
  alarmHandleRemark.value = alarm?.handleRemark ?? "";
  alarmHandleError.value = "";
}

function closeCreateDevice() {
  if (createDevicePending.value) {
    return;
  }
  showCreateDevice.value = false;
  createDeviceError.value = "";
}

async function submitCreateDevice() {
  if (!canCreateDevice.value) {
    createDeviceError.value = "当前账号无权新增设备";
    return;
  }
  createDevicePending.value = true;
  createDeviceError.value = "";
  try {
    overview.value = await createDevice({
      id: createDeviceForm.id.trim(),
      name: createDeviceForm.name.trim(),
      location: createDeviceForm.location.trim()
    });
    selectedDeviceId.value = createDeviceForm.id.trim();
    deviceSearch.value = "";
    deviceStatusFilter.value = "ALL";
    showCreateDevice.value = false;
    await loadHistory();
    await loadAuditLogs();
  } catch (error) {
    createDeviceError.value = error instanceof Error ? error.message : "新增设备失败";
  } finally {
    createDevicePending.value = false;
  }
}

async function handleSelectedAlarm() {
  if (!selectedAlarm.value || selectedAlarm.value.handled || !canOperate.value) {
    return;
  }
  alarmHandlePending.value = true;
  alarmHandleError.value = "";
  try {
    await handleAlarm(selectedAlarm.value.id, {
      remark: alarmHandleRemark.value.trim()
    });
    await loadOverview();
    await loadAuditLogs();
  } catch (error) {
    alarmHandleError.value = error instanceof Error ? error.message : "告警处理失败";
  } finally {
    alarmHandlePending.value = false;
  }
}

async function persistRule() {
  if (!selectedThreshold.value) {
    return;
  }
  await saveThreshold(selectedDeviceId.value, {
    ...selectedThreshold.value,
    lowThreshold: Number(ruleForm.lowThreshold),
    highThreshold: Number(ruleForm.highThreshold),
    enabled: ruleForm.enabled
  });
  await loadOverview();
}

async function dispatchRegionCommand() {
  if (!canOperate.value || !regionCommandForm.region.trim()) {
    return;
  }
  regionCommandPending.value = true;
  regionCommandError.value = "";
  regionCommandMessage.value = "";
  try {
    const result = await sendRegionCommand({
      region: regionCommandForm.region.trim(),
      command: regionCommandForm.command
    });
    regionCommandMessage.value = `${result.message}：${result.matchedDevices.join("、")}`;
    await loadOverview();
    await loadAuditLogs();
  } catch (error) {
    regionCommandError.value = error instanceof Error ? error.message : "区域批量控灯失败";
  } finally {
    regionCommandPending.value = false;
  }
}

function deviceLocationFor(deviceId?: string) {
  return overview.value?.devices.find((device) => device.id === deviceId)?.location ?? "--";
}

function powerFor(device?: Device) {
  if (!device || device.lampStatus !== "ON") {
    return 0;
  }
  return device.id.endsWith("2") ? 58 : 62;
}

function energyFor(device?: Device) {
  const power = powerFor(device);
  return power === 0 ? "0.00" : (power / 100).toFixed(2);
}

function formatDateTime(value?: string) {
  if (!value) {
    return "--";
  }
  return new Date(value).toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
}

function alarmLevelText(level: AlarmLog["alarmLevel"]) {
  return {
    INFO: "低",
    WARN: "中",
    CRITICAL: "高"
  }[level];
}

function faultPredictionsFor(deviceId: string): FaultPrediction[] {
  return (overview.value?.faultPredictions ?? []).filter((risk) => risk.deviceId === deviceId);
}

function highestRiskFor(deviceId: string): FaultPrediction | undefined {
  return faultPredictionsFor(deviceId)[0];
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

function riskTypeText(type: FaultPrediction["riskType"]) {
  return {
    HEARTBEAT_TIMEOUT: "心跳超时",
    LIGHT_SENSOR_ANOMALY: "光照异常",
    CONTROL_FAILURE: "控制失败",
    ALARM_BACKLOG: "告警积压"
  }[type];
}

function nextDeviceId() {
  const numericIds = (overview.value?.devices ?? [])
    .map((device) => Number(device.id.replace(/^SL-/i, "")))
    .filter((value) => Number.isFinite(value));
  const next = Math.max(0, ...numericIds) + 1;
  return `SL-${String(next).padStart(3, "0")}`;
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
  <div v-else class="app-shell prototype-shell">
    <SidebarNav
      :username="session.user.username"
      :role="session.user.role"
      :active-section="activeSection"
      @navigate="handleNavigate"
      @logout="handleLogout"
    />
    <main class="workspace">
      <header class="topbar">
        <div class="topbar-title">
          <span class="icon-button" title="导航"><Menu :size="18" /></span>
          <h1>{{ pageTitle }}</h1>
        </div>
        <div class="topbar-meta">
          <span class="connection-dot" :class="{ connected: !errorMessage }"></span>
          <span>{{ errorMessage ? "连接异常" : "已连接" }}</span>
          <Clock3 :size="15" />
          <span>{{ displayTime }}</span>
          <button class="user-menu" type="button" title="退出登录" @click="handleLogout">
            <UserRound :size="15" />
            <span>{{ session.user.username }}</span>
            <ChevronDown :size="13" />
          </button>
        </div>
      </header>

      <div v-if="loading" class="empty-state">正在加载智慧路灯运行数据...</div>
      <div v-if="errorMessage" class="error-state">{{ errorMessage }}</div>

      <template v-if="overview">
        <section v-if="activeSection === 'overview'" class="page-content overview-page" aria-label="系统总览">
          <div class="kpi-grid">
            <KpiCard label="实时光照" :value="String(overview.stats.averageLight)" unit="lux" note="平均最新光照" tone="teal" icon="sun" />
            <KpiCard
              label="在线设备"
              :value="`${overview.stats.onlineDevices}`"
              :unit="`/ ${overview.stats.deviceTotal}`"
              note="心跳状态"
              tone="green"
              icon="device"
            />
            <KpiCard label="今日告警" :value="String(overview.stats.activeAlarms)" note="未处理告警" tone="amber" icon="alarm" />
            <KpiCard label="节能状态" value="自动" note="阈值联动启用" tone="leaf" icon="leaf" />
          </div>

          <section class="overview-main-grid">
            <TrendChart
              class="trend-panel"
              :history="history"
              :device-id="selectedDeviceId"
              :devices="overview.devices"
              @select-device="selectedDeviceId = $event"
            />
            <DeviceControl
              v-if="selectedDevice && selectedThreshold"
              class="status-panel"
              :device="selectedDevice"
              :threshold="selectedThreshold"
              :latest-reading="latestReading"
              :can-operate="canOperate"
              @changed="loadOverview"
            />
          </section>

          <section class="overview-bottom-grid">
            <DeviceTable
              class="compact-table"
              :devices="overview.devices"
              :latest-readings="overview.latestReadings"
              :fault-predictions="overview.faultPredictions"
              :selected-device-id="selectedDeviceId"
              compact
              @select-device="selectedDeviceId = $event"
              @open-detail="openDeviceDetail"
            />
            <AlarmList :alarms="overview.alarms" :can-operate="canOperate" @changed="loadOverview" @show-more="activeSection = 'alarms'" />
            <AgentChat compact />
          </section>
        </section>

        <section v-if='activeSection === "gis"' class="page-content gis-page">
          <section class="panel region-map-panel">
            <div class="panel-title-row">
              <div>
                <h2>GIS 区域管控</h2>
                <p>按位置关键字圈定设备，统一下发开关灯指令</p>
              </div>
              <span class="state-pill done">{{ regionMatchedDevices.length }} 台匹配</span>
            </div>
            <div class="region-command-grid gis-command-grid">
              <label>
                区域关键字
                <input
                  v-model.trim="regionCommandForm.region"
                  list="region-options"
                  maxlength="120"
                  placeholder="宿舍区 / 主干道 / 南门"
                  :disabled="!canOperate || regionCommandPending"
                />
              </label>
              <label>
                控灯动作
                <select v-model="regionCommandForm.command" :disabled="!canOperate || regionCommandPending">
                  <option value="TURN_ON">开灯</option>
                  <option value="TURN_OFF">关灯</option>
                </select>
              </label>
              <button
                class="primary-action slim"
                type="button"
                :disabled="!canOperate || regionCommandPending || !regionCommandForm.region.trim()"
                @click="dispatchRegionCommand"
              >
                {{ regionCommandPending ? "下发中" : "区域批量下发" }}
              </button>
            </div>
            <p v-if="regionCommandError" class="form-error">{{ regionCommandError }}</p>
            <p v-if="regionCommandMessage" class="form-success">{{ regionCommandMessage }}</p>
            <div class="region-map-summary">
              <article><span>在线设备</span><strong>{{ regionMatchedDevices.filter((device) => device.onlineStatus === "ONLINE").length }}</strong></article>
              <article><span>开灯设备</span><strong>{{ regionMatchedDevices.filter((device) => device.lampStatus === "ON").length }}</strong></article>
              <article><span>离线设备</span><strong>{{ regionMatchedDevices.filter((device) => device.onlineStatus === "OFFLINE").length }}</strong></article>
            </div>
            <div class="region-map-grid">
              <button
                v-for="device in regionMatchedDevices"
                :key="device.id"
                class="region-device-pin"
                :class="[device.onlineStatus.toLowerCase(), device.lampStatus.toLowerCase(), { selected: device.id === selectedDeviceId }]"
                type="button"
                @click="selectedDeviceId = device.id"
              >
                <span class="pin-light"></span>
                <strong>{{ device.id }}</strong>
                <em>{{ device.location }}</em>
                <small>{{ device.onlineStatus === "ONLINE" ? "在线" : "离线" }} · {{ device.lampStatus === "ON" ? "开灯" : "关灯" }}</small>
              </button>
              <div v-if="regionMatchedDevices.length === 0" class="audit-empty">暂无匹配设备</div>
            </div>
          </section>
          <section class="panel table-panel">
            <div class="panel-header compact">
              <div>
                <h2>区域设备清单</h2>
                <p>当前区域匹配结果</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>设备ID</th>
                  <th>位置</th>
                  <th>在线状态</th>
                  <th>灯具状态</th>
                  <th>当前光照</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="device in regionMatchedDevices" :key="device.id">
                  <td>{{ device.id }}</td>
                  <td>{{ device.location }}</td>
                  <td><span class="status-badge" :class="device.onlineStatus === 'ONLINE' ? 'online' : 'offline'">{{ device.onlineStatus === "ONLINE" ? "在线" : "离线" }}</span></td>
                  <td><span class="state-pill" :class="{ on: device.lampStatus === 'ON' }">{{ device.lampStatus }}</span></td>
                  <td>{{ overview.latestReadings.find((reading) => reading.deviceId === device.id)?.lightIntensity ?? "--" }} lux</td>
                  <td><button class="text-button" type="button" @click="openDeviceDetail(device.id)">详情</button></td>
                </tr>
              </tbody>
            </table>
          </section>
        </section>

        <section v-if='activeSection === "monitor"' class="page-content monitor-page">
          <section class="monitor-layout">
            <article class="panel monitor-hero">
              <div class="panel-title-row">
                <div>
                  <h2>光照实时监测</h2>
                  <p>{{ selectedDeviceId }} · {{ selectedDevice?.location ?? "--" }}</p>
                </div>
                <label class="filter-select">
                  <select v-model="selectedDeviceId">
                    <option v-for="device in overview.devices" :key="device.id" :value="device.id">{{ device.id }}（{{ device.location }}）</option>
                  </select>
                  <ChevronDown :size="13" />
                </label>
              </div>
              <div class="light-gauge">
                <div class="light-value">{{ latestReading?.lightIntensity ?? "--" }}<span>lux</span></div>
                <div class="light-progress"><span :style="{ width: `${monitorLightPercent}%` }"></span></div>
                <div class="light-scale"><span>0</span><span>250</span><span>500</span></div>
              </div>
              <div class="monitor-stat-grid">
                <article><span>灯具状态</span><strong>{{ selectedDevice?.lampStatus ?? "--" }}</strong></article>
                <article><span>自动控制</span><strong>{{ selectedThreshold?.enabled ? "启用" : "停用" }}</strong></article>
                <article><span>最后上报</span><strong>{{ formatDateTime(latestReading?.reportedAt) }}</strong></article>
              </div>
            </article>
            <TrendChart
              class="monitor-chart"
              :history="history"
              :device-id="selectedDeviceId"
              :devices="overview.devices"
              @select-device="selectedDeviceId = $event"
            />
          </section>
          <section class="panel table-panel">
            <div class="panel-header compact">
              <h2>最近光照样本</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>设备ID</th>
                  <th>光照</th>
                  <th>灯具状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="reading in historyRows" :key="reading.id">
                  <td>{{ reading.time }}</td>
                  <td>{{ reading.deviceId }}</td>
                  <td>{{ reading.lightIntensity }} lux</td>
                  <td>{{ reading.lampStatus }}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </section>

        <section v-if='activeSection === "history"' class="page-content history-page">
          <div class="toolbar-row">
            <label><CalendarDays :size="14" /> 日期 <input v-model="historyDate" type="date" /></label>
            <label>
              设备
              <select v-model="selectedDeviceId">
                <option v-for="device in overview.devices" :key="device.id" :value="device.id">{{ device.id }}（{{ device.location }}）</option>
              </select>
            </label>
            <button class="primary-action slim" type="button" @click="loadHistory">刷新趋势</button>
          </div>
          <div class="history-kpi-grid">
            <KpiCard label="平均光照" :value="String(historySummary.average)" unit="lux" note="样本均值" tone="teal" icon="sun" />
            <KpiCard label="最高光照" :value="String(historySummary.max)" unit="lux" note="峰值" tone="amber" icon="sun" />
            <KpiCard label="最低光照" :value="String(historySummary.min)" unit="lux" note="谷值" tone="slate" icon="device" />
            <KpiCard label="样本数量" :value="String(historySummary.samples)" note="历史记录" tone="green" icon="device" />
          </div>
          <TrendChart
            class="history-chart"
            :history="history"
            :device-id="selectedDeviceId"
            :devices="overview.devices"
            @select-device="selectedDeviceId = $event"
          />
          <section class="panel table-panel">
            <div class="panel-header compact">
              <h2>历史明细</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>上报时间</th>
                  <th>光照值</th>
                  <th>灯具状态</th>
                  <th>估算功率</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="reading in historyRows" :key="`history-${reading.id}`">
                  <td>{{ reading.time }}</td>
                  <td>{{ reading.lightIntensity }} lux</td>
                  <td>{{ reading.lampStatus }}</td>
                  <td>{{ reading.power }}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </section>

        <section v-if="activeSection === 'devices' && deviceView === 'list'" class="page-content list-page">
          <div class="toolbar-row">
            <div class="search-box"><Search :size="15" /><input v-model="deviceSearch" placeholder="搜索设备ID / 位置" /></div>
            <label class="filter-select">
              <select v-model="deviceStatusFilter">
                <option value="ALL">全部状态</option>
                <option value="ONLINE">在线</option>
                <option value="OFFLINE">离线</option>
              </select>
              <ChevronDown :size="13" />
            </label>
            <button class="primary-action slim" type="button" :disabled="!canCreateDevice" @click="showCreateDevice = true">
              <Plus :size="15" /> 添加设备
            </button>
            <div class="spacer"></div>
            <KpiCard label="全部设备" :value="String(overview.stats.deviceTotal)" note="总量" tone="slate" icon="device" mini />
            <KpiCard label="在线设备" :value="String(overview.stats.onlineDevices)" note="在线" tone="green" icon="device" mini />
            <KpiCard label="离线设备" :value="String(overview.stats.offlineDevices)" note="离线" tone="amber" icon="alarm" mini />
            <KpiCard label="开灯设备" :value="String(overview.devices.filter((item) => item.lampStatus === 'ON').length)" note="开启" tone="leaf" icon="sun" mini />
            <KpiCard label="故障预判" :value="String(overview.faultPredictions.length)" note="风险项" tone="amber" icon="alarm" mini />
          </div>
          <DeviceTable
            :devices="filteredDevices"
            :latest-readings="overview.latestReadings"
            :fault-predictions="overview.faultPredictions"
            :selected-device-id="selectedDeviceId"
            @select-device="selectedDeviceId = $event"
            @open-detail="openDeviceDetail"
          />
        </section>

        <section v-if="activeSection === 'devices' && deviceView === 'detail'" class="page-content detail-page">
          <div class="detail-heading">
            <button class="secondary-action slim" type="button" @click="deviceView = 'list'">返回</button>
            <strong>设备详情（{{ selectedDeviceId }}）</strong>
          </div>
          <section class="detail-top-grid">
            <article v-if="selectedDevice" class="panel device-profile-card">
              <StreetlightVisual :status="selectedDevice.lampStatus" />
              <div class="profile-fields">
                <span class="soft-badge">自动</span>
                <dl>
                  <dt>位置</dt>
                  <dd>{{ selectedDevice.location }}</dd>
                  <dt>当前光照</dt>
                  <dd>{{ latestReading?.lightIntensity ?? "--" }} lux</dd>
                  <dt>灯具状态</dt>
                  <dd><span class="state-pill on">{{ selectedDevice.lampStatus }}</span></dd>
                  <dt>当前功率</dt>
                  <dd>{{ powerFor(selectedDevice) }} W</dd>
                  <dt>今日能耗</dt>
                  <dd>{{ energyFor(selectedDevice) }} kWh</dd>
                </dl>
              </div>
            </article>
            <DeviceControl
              v-if="selectedDevice && selectedThreshold"
              :device="selectedDevice"
              :threshold="selectedThreshold"
              :latest-reading="latestReading"
              :can-operate="canOperate"
              @changed="loadOverview"
            />
            <article v-if="selectedDevice" class="panel info-card">
              <h2>设备信息</h2>
              <dl>
                <dt>设备ID</dt>
                <dd>{{ selectedDevice.id }}</dd>
                <dt>设备型号</dt>
                <dd>SL-LAMP-100</dd>
                <dt>固件版本</dt>
                <dd>v1.2.3</dd>
                <dt>最后心跳</dt>
                <dd>{{ formatDateTime(selectedDevice.lastHeartbeatAt) }}</dd>
              </dl>
            </article>
            <article class="panel fault-card">
              <div class="panel-title-row">
                <h2>故障预判</h2>
                <span class="risk-pill" :class="highestRiskFor(selectedDeviceId)?.riskLevel.toLowerCase()">
                  {{ riskLevelText(highestRiskFor(selectedDeviceId)?.riskLevel) }}
                </span>
              </div>
              <div v-if="selectedFaultPredictions.length" class="risk-list">
                <article v-for="risk in selectedFaultPredictions" :key="risk.id">
                  <strong>{{ riskTypeText(risk.riskType) }}</strong>
                  <span>{{ riskLevelText(risk.riskLevel) }}</span>
                  <p>{{ risk.reason }}</p>
                  <em>{{ risk.suggestedAction }}</em>
                </article>
              </div>
              <p v-else class="audit-empty">当前设备暂无故障风险。</p>
            </article>
          </section>
          <section class="detail-bottom-grid">
            <TrendChart
              class="detail-chart"
              :history="history"
              :device-id="selectedDeviceId"
              :devices="overview.devices"
              compact
              @select-device="selectedDeviceId = $event"
            />
            <article class="panel control-log-panel">
              <div class="panel-header compact">
                <div>
                  <h2>控制记录</h2>
                  <p>最近开关灯与运维操作</p>
                </div>
              </div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>操作</th>
                      <th>执行人</th>
                      <th>结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in controlRecordRows" :key="`${row.time}-${row.action}`">
                      <td>{{ row.time }}</td>
                      <td>{{ row.action }}</td>
                      <td>{{ row.actor }}</td>
                      <td><span class="state-pill done">{{ row.result }}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
            <AlarmList
              :alarms="overview.alarms.filter((alarm) => alarm.deviceId === selectedDeviceId)"
              :can-operate="canOperate"
              @changed="loadOverview"
              @show-more="activeSection = 'alarms'"
            />
          </section>
        </section>

        <section v-if="activeSection === 'alarms'" class="page-content alarm-page">
          <div class="toolbar-row">
            <label>
              告警级别
              <select v-model="alarmLevelFilter">
                <option value="ALL">全部</option>
                <option value="CRITICAL">高</option>
                <option value="WARN">中</option>
                <option value="INFO">低</option>
              </select>
            </label>
            <label>
              处理状态
              <select v-model="alarmStatusFilter">
                <option value="ALL">全部</option>
                <option value="PENDING">待处理</option>
                <option value="HANDLED">已处理</option>
              </select>
            </label>
            <label>设备ID <input v-model="alarmDeviceKeyword" placeholder="请输入设备ID" /></label>
            <label><CalendarDays :size="14" /> 开始日期 <input v-model="alarmStartDate" type="date" /></label>
            <label><CalendarDays :size="14" /> 结束日期 <input v-model="alarmEndDate" type="date" /></label>
            <button class="primary-action slim" type="button" @click="alarmDeviceKeyword = alarmDeviceKeyword.trim()">搜索</button>
          </div>
          <section class="alarm-layout">
            <div class="alarm-table-area">
              <div class="alarm-stat-row">
                <article><Bell :size="20" /><span>未处理</span><strong>{{ alarmStats.pending }}</strong></article>
                <article><Clock3 :size="20" /><span>中优先级</span><strong>{{ alarmStats.warning }}</strong></article>
                <article><FileText :size="20" /><span>已处理</span><strong>{{ alarmStats.resolved }}</strong></article>
                <article><Bell :size="20" /><span>高优先级</span><strong>{{ alarmStats.critical }}</strong></article>
              </div>
              <div class="panel table-panel">
                <table>
                  <thead>
                    <tr>
                      <th>告警类型</th>
                      <th>级别</th>
                      <th>设备ID</th>
                      <th>位置</th>
                      <th>内容</th>
                      <th>发生时间</th>
                      <th>处理状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="alarm in filteredAlarms"
                      :key="alarm.id"
                      :class="{ selected: alarm.id === selectedAlarm?.id }"
                      @click="selectAlarm(alarm.id)"
                    >
                      <td>{{ alarm.alarmType }}</td>
                      <td><span class="level-dot" :class="alarm.alarmLevel.toLowerCase()">{{ alarmLevelText(alarm.alarmLevel) }}</span></td>
                      <td>{{ alarm.deviceId }}</td>
                      <td>{{ deviceLocationFor(alarm.deviceId) }}</td>
                      <td>{{ alarm.alarmContent }}</td>
                      <td>{{ formatDateTime(alarm.createdAt) }}</td>
                      <td><span class="state-pill" :class="{ done: alarm.handled }">{{ alarm.handled ? "已处理" : "待处理" }}</span></td>
                      <td><button class="text-button" type="button" @click="selectAlarm(alarm.id)">查看</button></td>
                    </tr>
                    <tr v-if="filteredAlarms.length === 0">
                      <td colspan="8" class="audit-empty">暂无匹配告警</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <aside v-if="selectedAlarm" class="panel alarm-detail-card">
              <div class="panel-title-row">
                <h2>告警详情</h2>
                <span class="soft-badge danger">{{ alarmLevelText(selectedAlarm.alarmLevel) }}优先级</span>
              </div>
              <h3>{{ selectedAlarm.alarmType }}</h3>
              <dl>
                <dt>设备ID</dt>
                <dd>{{ selectedAlarm.deviceId }}</dd>
                <dt>位置</dt>
                <dd>{{ deviceLocationFor(selectedAlarm.deviceId) }}</dd>
                <dt>发生时间</dt>
                <dd>{{ formatDateTime(selectedAlarm.createdAt) }}</dd>
                <dt>告警内容</dt>
                <dd>{{ selectedAlarm.alarmContent }}</dd>
                <dt>处理状态</dt>
                <dd>{{ selectedAlarm.handled ? "已处理" : "待处理" }}</dd>
                <template v-if="selectedAlarm.handledBy">
                  <dt>处理人</dt>
                  <dd>{{ selectedAlarm.handledBy }}</dd>
                </template>
                <template v-if="selectedAlarm.handledAt">
                  <dt>处理时间</dt>
                  <dd>{{ formatDateTime(selectedAlarm.handledAt) }}</dd>
                </template>
                <template v-if="selectedAlarm.handleRemark">
                  <dt>处理备注</dt>
                  <dd>{{ selectedAlarm.handleRemark }}</dd>
                </template>
              </dl>
              <p v-if="alarmHandleError" class="form-error">{{ alarmHandleError }}</p>
              <label v-if="!selectedAlarm.handled" class="handle-remark-field">
                处理备注
                <textarea
                  v-model.trim="alarmHandleRemark"
                  maxlength="300"
                  placeholder="填写处理过程、现场反馈或后续动作"
                ></textarea>
              </label>
              <div class="suggest-box">
                <strong>建议操作</strong>
                <ol>
                  <li>检查光照传感器数据是否稳定。</li>
                  <li>确认设备通信与继电器状态。</li>
                  <li>联系现场人员复核灯具状态。</li>
                </ol>
              </div>
              <div class="button-row">
                <button class="secondary-action slim" type="button" @click="openDeviceDetail(selectedAlarm.deviceId)">查看设备</button>
                <button
                  class="primary-action slim"
                  type="button"
                  :disabled="!canOperate || selectedAlarm.handled || alarmHandlePending || !alarmHandleRemark.trim()"
                  @click="handleSelectedAlarm"
                >
                  {{ alarmHandlePending ? "处理中" : "已处理" }}
                </button>
              </div>
            </aside>
          </section>
        </section>

        <section v-if="activeSection === 'rules'" class="page-content rules-page">
          <section class="panel threshold-tuning-panel">
            <div class="panel-title-row">
              <div>
                <h2>光照阈值调试面板</h2>
                <p>{{ selectedDeviceId }} · {{ selectedDevice?.location ?? "--" }}</p>
              </div>
              <span class="state-pill" :class="{ on: thresholdPreviewStatus === '开灯中', done: thresholdPreviewStatus === '关灯中' }">
                {{ thresholdPreviewStatus }}
              </span>
            </div>
            <div class="threshold-tuning-grid">
              <div class="threshold-slider-stack">
                <label>
                  模拟光照
                  <input v-model.number="thresholdPreviewLight" type="range" min="0" max="500" step="1" />
                  <strong>{{ thresholdPreviewLight }} lux</strong>
                </label>
                <label>
                  开灯阈值
                  <input v-model.number="ruleForm.lowThreshold" type="range" min="0" max="500" step="1" :disabled="!canOperate" />
                  <strong>{{ ruleForm.lowThreshold }} lux</strong>
                </label>
                <label>
                  关灯阈值
                  <input v-model.number="ruleForm.highThreshold" type="range" min="0" max="500" step="1" :disabled="!canOperate" />
                  <strong>{{ ruleForm.highThreshold }} lux</strong>
                </label>
              </div>
              <div class="threshold-preview-stage" :class="thresholdPreviewClass">
                <div class="preview-lamp">灯</div>
                <strong>{{ thresholdPreviewStatus }}</strong>
                <p>{{ thresholdPreviewHint }}</p>
                <button class="primary-action slim" type="button" :disabled="!canOperate" @click="persistRule">保存并下发</button>
              </div>
            </div>
          </section>
          <section class="panel rules-editor">
            <div class="rule-control-grid">
              <label>设备选择 <select v-model="selectedDeviceId"><option v-for="device in overview.devices" :key="device.id" :value="device.id">{{ device.id }}（{{ device.location }}）</option></select></label>
              <label class="switch-control">自动控制 <input v-model="ruleForm.enabled" type="checkbox" :disabled="!canOperate" /></label>
              <label>开灯阈值（lux） <input v-model.number="ruleForm.lowThreshold" type="number" min="0" :disabled="!canOperate" /></label>
              <label>关灯阈值（lux） <input v-model.number="ruleForm.highThreshold" type="number" min="0" :disabled="!canOperate" /></label>
              <label>心跳超时时间（分钟） <input value="5" type="number" /></label>
              <label>告警级别 <select><option>高</option><option>中</option><option>低</option></select></label>
              <button class="primary-action slim" type="button" :disabled="!canOperate" @click="persistRule">保存规则</button>
            </div>
            <aside class="rule-help">
              <h2>规则说明</h2>
              <p>当实时光照低于开灯阈值时，系统自动开灯。</p>
              <p>当实时光照高于关灯阈值时，系统自动关灯。</p>
              <p>心跳超时将触发设备离线告警。</p>
            </aside>
          </section>
          <section class="panel region-command-panel">
            <div class="panel-title-row">
              <div>
                <h2>区域批量控灯</h2>
                <p>按设备位置关键字匹配，逐台通过 MQTT 下发并等待回执</p>
              </div>
              <span class="state-pill done">MQTT</span>
            </div>
            <div class="region-command-grid">
              <label>
                区域关键字
                <input v-model.trim="regionCommandForm.region" list="region-options" maxlength="120" placeholder="宿舍区 / 主干道 / 南门" :disabled="!canOperate || regionCommandPending" />
                <datalist id="region-options">
                  <option v-for="region in regionOptions" :key="region" :value="region" />
                </datalist>
              </label>
              <label>
                控灯动作
                <select v-model="regionCommandForm.command" :disabled="!canOperate || regionCommandPending">
                  <option value="TURN_ON">开灯</option>
                  <option value="TURN_OFF">关灯</option>
                </select>
              </label>
              <button
                class="primary-action slim"
                type="button"
                :disabled="!canOperate || regionCommandPending || !regionCommandForm.region.trim()"
                @click="dispatchRegionCommand"
              >
                {{ regionCommandPending ? "下发中" : "批量下发" }}
              </button>
            </div>
            <p v-if="regionCommandError" class="form-error">{{ regionCommandError }}</p>
            <p v-if="regionCommandMessage" class="form-success">{{ regionCommandMessage }}</p>
          </section>
          <section class="panel threshold-visual">
            <h2>阈值可视化（光照 lux）</h2>
            <div class="threshold-scale">
              <span class="threshold-fill"></span>
              <i class="threshold-marker low" :style="{ left: `${Math.min((ruleForm.highThreshold / 350) * 100, 100)}%` }"></i>
              <i class="threshold-marker high" :style="{ left: `${Math.min((ruleForm.lowThreshold / 350) * 100, 100)}%` }"></i>
            </div>
            <div class="scale-labels"><span>0</span><span>50</span><span>100</span><span>150</span><span>200</span><span>250</span><span>300</span><span>350</span></div>
          </section>
          <section class="panel table-panel">
            <div class="panel-header compact">
              <h2>规则列表</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>规则名称</th>
                  <th>适用设备</th>
                  <th>触发条件</th>
                  <th>动作</th>
                  <th>状态</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="threshold in overview.thresholds" :key="threshold.deviceId">
                  <td>默认规则</td>
                  <td>{{ threshold.deviceId }}</td>
                  <td>光照 &lt; {{ threshold.lowThreshold }} lux 开灯；光照 &gt; {{ threshold.highThreshold }} lux 关灯</td>
                  <td>自动控制</td>
                  <td><span class="state-pill done">{{ threshold.enabled ? "启用" : "停用" }}</span></td>
                  <td>{{ formatDateTime(threshold.updatedAt) }}</td>
                  <td><button class="text-button" type="button" @click="selectedDeviceId = threshold.deviceId">编辑</button></td>
                </tr>
              </tbody>
            </table>
          </section>
        </section>

        <section v-if="activeSection === 'agent'" class="page-content agent-page">
          <aside class="panel conversation-list">
            <div class="tabs"><span class="active">会话列表</span><span>常见问题</span></div>
            <article class="conversation active">当前设备离线如何排查？<span>10:31</span></article>
            <article class="conversation">SL-003 离线怎么处理？<span>10:29</span></article>
            <article class="conversation">光照异常是什么原因？<span>10:10</span></article>
          </aside>
          <AgentChat class="agent-chat-main" />
          <aside class="agent-side">
            <article v-if="selectedDevice" class="panel mini-status-card">
              <h2>关联设备状态（{{ selectedDevice.id }}）</h2>
              <dl>
                <dt>在线状态</dt>
                <dd>{{ selectedDevice.onlineStatus === "ONLINE" ? "在线" : "离线" }}</dd>
                <dt>位置</dt>
                <dd>{{ selectedDevice.location }}</dd>
                <dt>灯具状态</dt>
                <dd>{{ selectedDevice.lampStatus }}</dd>
                <dt>当前功率</dt>
                <dd>{{ powerFor(selectedDevice) }} W</dd>
                <dt>今日能耗</dt>
                <dd>{{ energyFor(selectedDevice) }} kWh</dd>
              </dl>
              <button class="secondary-action slim" type="button" @click="openDeviceDetail(selectedDevice.id)">查看设备详情</button>
            </article>
            <article class="panel guide-card">
              <h2>故障预判</h2>
              <article
                v-for="risk in selectedFaultPredictions"
                :key="risk.id"
                class="guide-action"
              >
                <Bell :size="14" /> {{ riskTypeText(risk.riskType) }} · {{ riskLevelText(risk.riskLevel) }}
              </article>
              <p v-if="selectedFaultPredictions.length === 0" class="audit-empty">暂无风险提示</p>
            </article>
            <article class="panel guide-card">
              <h2>推荐操作</h2>
              <div class="guide-action"><ListFilter :size="14" /> 重启设备需现场运维确认</div>
              <div class="guide-action"><Search :size="14" /> 检查网络连接</div>
              <div class="guide-action"><SlidersHorizontal :size="14" /> 检查阈值配置</div>
              <div class="guide-action"><FileText :size="14" /> 联系现场维护</div>
            </article>
          </aside>
        </section>
      </template>
    </main>

    <div v-if="showCreateDevice" class="modal-backdrop" role="presentation" @click.self="closeCreateDevice">
      <section class="panel modal-panel" role="dialog" aria-modal="true" aria-labelledby="create-device-title">
        <div class="panel-title-row">
          <h2 id="create-device-title">添加设备</h2>
          <button class="text-button" type="button" :disabled="createDevicePending" @click="closeCreateDevice">关闭</button>
        </div>
        <form class="create-device-form" @submit.prevent="submitCreateDevice">
          <label>
            设备ID
            <input v-model.trim="createDeviceForm.id" required maxlength="32" placeholder="SL-005" />
          </label>
          <label>
            设备名称
            <input v-model.trim="createDeviceForm.name" required maxlength="80" placeholder="5 号路灯" />
          </label>
          <label>
            设备位置
            <input v-model.trim="createDeviceForm.location" required maxlength="120" placeholder="校园主干道西侧" />
          </label>
          <p v-if="createDeviceError" class="form-error">{{ createDeviceError }}</p>
          <div class="button-row">
            <button class="secondary-action" type="button" :disabled="createDevicePending" @click="closeCreateDevice">取消</button>
            <button class="primary-action" type="submit" :disabled="createDevicePending || !canCreateDevice">
              {{ createDevicePending ? "提交中" : "确认添加" }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </div>
</template>
