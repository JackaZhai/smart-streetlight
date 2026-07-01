<script setup lang="ts">
import { AlertTriangle, Bot, Gauge, Lightbulb, MapPinned } from "lucide-vue-next";

const navItems = [
  { label: "总览", icon: Gauge, active: true },
  { label: "设备", icon: Lightbulb, active: false },
  { label: "告警", icon: AlertTriangle, active: false },
  { label: "智能问答", icon: Bot, active: false }
];
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark"><MapPinned :size="21" /></div>
      <span>智慧路灯</span>
    </div>
    <nav>
      <button v-for="item in navItems" :key="item.label" :class="{ active: item.active }" type="button">
        <component :is="item.icon" :size="18" />
        <span>{{ item.label }}</span>
      </button>
    </nav>
  </aside>
</template>
