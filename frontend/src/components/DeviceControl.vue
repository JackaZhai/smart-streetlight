<script setup lang="ts">
import { Minus, Plus, Power, PowerOff, Save } from "lucide-vue-next";
import { reactive, watch } from "vue";
import { saveThreshold, sendCommand, type Device, type LightReading, type ThresholdConfig } from "../services/api";
import StreetlightVisual from "./StreetlightVisual.vue";

const props = defineProps<{
  device: Device;
  threshold: ThresholdConfig;
  latestReading?: LightReading;
  canOperate: boolean;
}>();

const emit = defineEmits<{
  changed: [];
}>();

const form = reactive({
  lowThreshold: props.threshold.lowThreshold,
  highThreshold: props.threshold.highThreshold,
  enabled: props.threshold.enabled
});

watch(
  () => props.threshold,
  (threshold) => {
    form.lowThreshold = threshold.lowThreshold;
    form.highThreshold = threshold.highThreshold;
    form.enabled = threshold.enabled;
  },
  { deep: true }
);

async function control(command: "TURN_ON" | "TURN_OFF") {
  await sendCommand(props.device.id, command);
  emit("changed");
}

function adjust(field: "lowThreshold" | "highThreshold", delta: number) {
  form[field] = Math.max(0, Number(form[field]) + delta);
}

async function persistThreshold() {
  await saveThreshold(props.device.id, {
    ...props.threshold,
    lowThreshold: Number(form.lowThreshold),
    highThreshold: Number(form.highThreshold),
    enabled: form.enabled
  });
  emit("changed");
}
</script>

<template>
  <section class="panel control-panel">
    <div class="panel-title-row">
      <h2>设备状态（{{ device.id }}）</h2>
      <span class="soft-badge">{{ form.enabled ? "自动" : "手动" }}</span>
    </div>

    <div class="device-status-body">
      <StreetlightVisual :status="device.lampStatus" />
      <dl class="status-fields">
        <dt>灯具状态</dt>
        <dd><span class="state-pill" :class="{ on: device.lampStatus === 'ON' }">{{ device.lampStatus }}</span></dd>
        <dt>当前功率</dt>
        <dd>{{ device.lampStatus === "ON" ? 62 : 0 }} W</dd>
        <dt>今日能耗</dt>
        <dd>{{ device.lampStatus === "ON" ? "0.62" : "0.00" }} kWh</dd>
        <dt>运行时长</dt>
        <dd>{{ device.lampStatus === "ON" ? "10 h 32 m" : "--" }}</dd>
      </dl>
    </div>

    <form class="threshold-form prototype" @submit.prevent="persistThreshold">
      <div class="field-title">光照阈值设置（lux）</div>
      <label>
        开灯阈值
        <span class="stepper">
          <button type="button" :disabled="!canOperate" @click="adjust('lowThreshold', -10)"><Minus :size="12" /></button>
          <input v-model.number="form.lowThreshold" type="number" min="0" :disabled="!canOperate" />
          <button type="button" :disabled="!canOperate" @click="adjust('lowThreshold', 10)"><Plus :size="12" /></button>
        </span>
      </label>
      <label>
        关灯阈值
        <span class="stepper">
          <button type="button" :disabled="!canOperate" @click="adjust('highThreshold', -10)"><Minus :size="12" /></button>
          <input v-model.number="form.highThreshold" type="number" min="0" :disabled="!canOperate" />
          <button type="button" :disabled="!canOperate" @click="adjust('highThreshold', 10)"><Plus :size="12" /></button>
        </span>
      </label>
      <label class="switch-line">
        <input v-model="form.enabled" type="checkbox" :disabled="!canOperate" />
        自动控制
      </label>
      <button class="save-action" type="submit" :disabled="!canOperate"><Save :size="15" /> 保存</button>
    </form>

    <div class="button-row">
      <button class="primary-action" type="button" :disabled="!canOperate" @click="control('TURN_ON')">
        <Power :size="16" /> 开灯
      </button>
      <button class="secondary-action" type="button" :disabled="!canOperate" @click="control('TURN_OFF')">
        <PowerOff :size="16" /> 关灯
      </button>
    </div>
  </section>
</template>
