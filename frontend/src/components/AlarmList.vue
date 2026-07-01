<script setup lang="ts">
import { CheckCircle2, TriangleAlert } from "lucide-vue-next";
import { handleAlarm, type AlarmLog } from "../services/api";

defineProps<{
  alarms: AlarmLog[];
}>();

const emit = defineEmits<{
  changed: [];
}>();

async function markHandled(id: string) {
  await handleAlarm(id);
  emit("changed");
}
</script>

<template>
  <section class="panel alarm-panel">
    <div class="panel-header">
      <div>
        <h2>告警日志</h2>
        <p>未处理优先展示</p>
      </div>
    </div>
    <div class="alarm-list">
      <article v-for="alarm in alarms.slice(0, 6)" :key="alarm.id" :class="{ handled: alarm.handled }">
        <TriangleAlert :size="17" />
        <div>
          <strong>{{ alarm.deviceId }} · {{ alarm.alarmLevel }}</strong>
          <p>{{ alarm.alarmContent }}</p>
          <span>{{ new Date(alarm.createdAt).toLocaleString("zh-CN") }}</span>
        </div>
        <button v-if="!alarm.handled" type="button" title="标记已处理" @click="markHandled(alarm.id)">
          <CheckCircle2 :size="16" />
        </button>
      </article>
    </div>
  </section>
</template>
