<script setup lang="ts">
import { CheckCircle2, TriangleAlert } from "lucide-vue-next";
import { handleAlarm, type AlarmLog } from "../services/api";

defineProps<{
  alarms: AlarmLog[];
  canOperate: boolean;
}>();

const emit = defineEmits<{
  changed: [];
  "show-more": [];
}>();

async function markHandled(id: string) {
  await handleAlarm(id, { remark: "列表快捷处理" });
  emit("changed");
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <section class="panel alarm-panel">
    <div class="panel-header compact">
      <div>
        <h2>告警列表</h2>
        <p>未处理优先展示</p>
      </div>
      <button class="text-button" type="button" @click="emit('show-more')">更多 &gt;</button>
    </div>
    <div class="alarm-list">
      <article v-for="alarm in alarms.slice(0, 5)" :key="alarm.id" :class="{ handled: alarm.handled }">
        <TriangleAlert :size="17" />
        <div>
          <strong>{{ alarm.alarmType }}</strong>
          <p>{{ alarm.deviceId }} · {{ alarm.alarmContent }}</p>
          <span>{{ formatTime(alarm.createdAt) }}</span>
        </div>
        <button
          v-if="!alarm.handled"
          type="button"
          title="标记已处理"
          :disabled="!canOperate"
          @click="markHandled(alarm.id)"
        >
          <CheckCircle2 :size="15" />
        </button>
      </article>
      <div v-if="alarms.length === 0" class="audit-empty">暂无告警记录</div>
    </div>
  </section>
</template>
