<script setup lang="ts">
import { Bell, Leaf, MonitorCheck, SunMedium } from "lucide-vue-next";

const iconMap = {
  alarm: Bell,
  device: MonitorCheck,
  leaf: Leaf,
  sun: SunMedium
} as const;

defineProps<{
  label: string;
  value: string;
  note: string;
  tone: "teal" | "green" | "amber" | "leaf" | "slate";
  icon: keyof typeof iconMap;
  unit?: string;
  mini?: boolean;
}>();
</script>

<template>
  <article class="kpi-card" :class="[tone, { mini }]">
    <div class="kpi-icon"><component :is="iconMap[icon]" :size="mini ? 16 : 27" /></div>
    <div>
      <span>{{ label }}</span>
      <strong>{{ value }} <small v-if="unit">{{ unit }}</small></strong>
      <em>{{ note }}</em>
    </div>
  </article>
</template>
