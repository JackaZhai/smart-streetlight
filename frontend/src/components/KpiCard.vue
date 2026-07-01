<script setup lang="ts">
defineProps<{
  label: string;
  value: string;
  note: string;
  tone: "teal" | "green" | "amber" | "slate";
}>();
</script>

<template>
  <article class="kpi-card" :class="tone">
    <span>{{ label }}</span>
    <strong>{{ value }}</strong>
    <small>{{ note }}</small>
  </article>
</template>
