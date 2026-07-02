<script setup lang="ts">
import { ShieldCheck } from "lucide-vue-next";
import type { AuditLog } from "../services/api";

defineProps<{
  logs: AuditLog[];
}>();

const actionLabels: Record<string, string> = {
  "device.create": "新增设备",
  "threshold.update": "更新阈值",
  "command.dispatch": "下发控制",
  "alarm.handle": "处理告警",
  "audit.read": "查看审计"
};
</script>

<template>
  <section class="panel audit-panel">
    <div class="panel-header compact">
      <div>
        <h2>审计日志</h2>
        <p>最近权限与运维操作</p>
      </div>
      <ShieldCheck :size="20" />
    </div>
    <div class="audit-list">
      <article v-for="log in logs.slice(0, 8)" :key="log.id" :class="{ denied: log.result === 'DENIED' }">
        <div>
          <strong>{{ actionLabels[log.action] ?? log.action }}</strong>
          <span>{{ log.actorUsername }} · {{ log.actorRole }}</span>
        </div>
        <div>
          <strong>{{ log.targetType }} / {{ log.targetId }}</strong>
          <span>{{ new Date(log.createdAt).toLocaleString("zh-CN") }}</span>
        </div>
        <b>{{ log.result === "SUCCESS" ? "成功" : "拒绝" }}</b>
      </article>
      <div v-if="logs.length === 0" class="audit-empty">暂无审计记录</div>
    </div>
  </section>
</template>
