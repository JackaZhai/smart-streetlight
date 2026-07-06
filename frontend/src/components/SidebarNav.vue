<script setup lang="ts">
import { Activity, Bell, Bot, Gauge, History, Lightbulb, MapPinned, SlidersHorizontal } from "lucide-vue-next";
import type { UserRole } from "../services/api";

type DashboardSection = "overview" | "gis" | "monitor" | "history" | "devices" | "alarms" | "rules" | "agent";

defineProps<{
  username: string;
  role: UserRole;
  activeSection: DashboardSection;
}>();

const emit = defineEmits<{
  navigate: [section: DashboardSection];
  logout: [];
}>();

const navItems = [
  { key: "overview", label: "总览", icon: Gauge },
  { key: "gis", label: "区域管控", icon: MapPinned },
  { key: "monitor", label: "光照监测", icon: Activity },
  { key: "history", label: "历史趋势", icon: History },
  { key: "devices", label: "设备台账", icon: Lightbulb },
  { key: "alarms", label: "告警", icon: Bell },
  { key: "rules", label: "阈值规则", icon: SlidersHorizontal },
  { key: "agent", label: "智能问答", icon: Bot }
] satisfies Array<{
  key: DashboardSection;
  label: string;
  icon: typeof Gauge;
}>;
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark"><MapPinned :size="22" /></div>
      <span>智慧路灯</span>
    </div>
    <nav>
      <button
        v-for="item in navItems"
        :key="item.key"
        :class="{ active: item.key === activeSection }"
        type="button"
        @click="emit('navigate', item.key)"
      >
        <component :is="item.icon" :size="17" />
        <span>{{ item.label }}</span>
      </button>
    </nav>
  </aside>
</template>
