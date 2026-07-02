<script setup lang="ts">
import { Power, Save, SunMedium } from "lucide-vue-next";
import { reactive, watch } from "vue";
import { saveThreshold, sendCommand, type Device, type LightReading, type ThresholdConfig } from "../services/api";

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
    <div class="lamp-visual" :class="{ on: device.lampStatus === 'ON' }">
      <SunMedium :size="42" />
      <strong>{{ device.lampStatus === "ON" ? "路灯开启" : "路灯关闭" }}</strong>
      <span>{{ latestReading?.lightIntensity ?? "--" }} lux</span>
    </div>

    <div class="device-summary">
      <div>
        <span>当前设备</span>
        <strong>{{ device.name }}</strong>
      </div>
      <div>
        <span>运行状态</span>
        <strong :class="device.onlineStatus === 'ONLINE' ? 'ok-text' : 'warn-text'">
          {{ device.onlineStatus === "ONLINE" ? "在线" : "离线" }}
        </strong>
      </div>
    </div>

    <div class="button-row">
      <button class="primary-action" type="button" :disabled="!canOperate" @click="control('TURN_ON')">
        <Power :size="17" /> 开灯
      </button>
      <button class="secondary-action" type="button" :disabled="!canOperate" @click="control('TURN_OFF')">
        <Power :size="17" /> 关灯
      </button>
    </div>

    <form class="threshold-form" @submit.prevent="persistThreshold">
      <label>
        开灯阈值
        <input v-model.number="form.lowThreshold" type="number" min="0" :disabled="!canOperate" />
      </label>
      <label>
        关灯阈值
        <input v-model.number="form.highThreshold" type="number" min="0" :disabled="!canOperate" />
      </label>
      <label class="switch-line">
        <input v-model="form.enabled" type="checkbox" :disabled="!canOperate" />
        自动联动
      </label>
      <button class="save-action" type="submit" :disabled="!canOperate"><Save :size="16" /> 保存阈值</button>
    </form>
  </section>
</template>
