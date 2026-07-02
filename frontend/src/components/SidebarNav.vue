<script setup lang="ts">
import { Bell, Bot, Gauge, Lightbulb, MapPinned, SlidersHorizontal } from "lucide-vue-next";
import type { UserRole } from "../services/api";

type DashboardSection = "overview" | "devices" | "alarms" | "rules" | "agent";

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
  { key: "devices", label: "设备", icon: Lightbulb },
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
