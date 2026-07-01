<script setup lang="ts">
import { Bot, SendHorizontal } from "lucide-vue-next";
import { ref } from "vue";
import { askAgent } from "../services/api";

const question = ref("设备离线后应该怎么排查？");
const answer = ref("输入问题后，智能体会根据维护知识库和当前告警状态给出建议。");
const references = ref<string[]>([]);
const pending = ref(false);

async function submit() {
  if (!question.value.trim()) {
    return;
  }
  pending.value = true;
  try {
    const result = await askAgent(question.value);
    answer.value = result.answer;
    references.value = result.references;
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <section class="panel chat-panel">
    <div class="panel-header compact">
      <div>
        <h2>维护智能问答</h2>
        <p>本地规则版，可替换 MaxKB</p>
      </div>
      <Bot :size="21" />
    </div>
    <div class="chat-answer">
      {{ answer }}
      <div v-if="references.length" class="references">
        <span v-for="item in references" :key="item">{{ item }}</span>
      </div>
    </div>
    <form class="chat-form" @submit.prevent="submit">
      <input v-model="question" placeholder="输入路灯维护问题" />
      <button type="submit" :disabled="pending" title="发送问题">
        <SendHorizontal :size="17" />
      </button>
    </form>
  </section>
</template>
