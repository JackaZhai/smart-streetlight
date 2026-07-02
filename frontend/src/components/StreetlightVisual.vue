<script setup lang="ts">
import type { LampStatus } from "../services/api";

defineProps<{
  status: LampStatus;
}>();
</script>

<template>
  <div class="streetlight-visual" :class="{ lit: status === 'ON' }" aria-hidden="true">
    <span class="lamp-glow"></span>
    <span class="lamp-head"></span>
    <span class="lamp-arm"></span>
    <span class="lamp-pole"></span>
    <span class="lamp-box"></span>
    <span class="lamp-base"></span>
  </div>
</template>
