<script setup lang="ts">
import { Bot, SendHorizontal, UserRound } from "lucide-vue-next";
import { computed, ref } from "vue";
import { askAgent } from "../services/api";

withDefaults(
  defineProps<{
    compact?: boolean;
  }>(),
  {
    compact: false
  }
);

const question = ref("当前设备离线如何排查？");
const answer = ref("当前系统中有 2 台离线，今日总能耗 1.20 kWh。相比昨日用电量下降 18.8%，节能状态良好。");
const references = ref<string[]>([]);
const matches = ref<Array<{ title: string; source: string; snippet: string; score: number }>>([]);
const suggestedActions = ref<string[]>([]);
const provider = ref<"maxkb" | "local">("local");
const model = ref("");
const pending = ref(false);
const providerText = computed(() => (provider.value === "maxkb" ? `MaxKB ${model.value}`.trim() : "本地检索兜底"));

async function submit() {
  if (!question.value.trim()) {
    return;
  }
  pending.value = true;
  try {
    const result = await askAgent(question.value);
    answer.value = result.answer;
    references.value = result.references;
    matches.value = result.matches ?? [];
    suggestedActions.value = result.suggestedActions ?? [];
    provider.value = result.provider ?? "local";
    model.value = result.model ?? "";
  } finally {
    pending.value = false;
  }
}

async function askSuggestedAction(action: string) {
  question.value = action;
  await submit();
}
</script>

<template>
  <section class="panel chat-panel" :class="{ compact }">
    <div class="panel-header compact">
      <div>
        <h2>智能问答</h2>
        <p>维护知识库与运行状态联动</p>
      </div>
      <span class="model-provider">{{ providerText }}</span>
      <Bot :size="20" />
    </div>
    <div class="chat-thread">
      <div class="chat-bubble user">
        <span>10:31</span>
        {{ question }}
        <UserRound :size="17" />
      </div>
      <div class="chat-bubble bot">
        <Bot :size="17" />
        <p>{{ answer }}</p>
      </div>
      <div v-if="references.length" class="references">
        <span v-for="item in references" :key="item">{{ item }}</span>
      </div>
      <div v-if="matches.length" class="knowledge-matches">
        <strong>知识命中</strong>
        <article v-for="match in matches" :key="match.title">
          <span>{{ match.title }} · {{ match.score }}</span>
          <p>{{ match.snippet }}</p>
        </article>
      </div>
      <div v-if="suggestedActions.length" class="suggested-actions">
        <strong>推荐操作</strong>
        <button v-for="item in suggestedActions" :key="item" type="button" :disabled="pending" @click="askSuggestedAction(item)">
          {{ item }}
        </button>
      </div>
    </div>
    <form class="chat-form" @submit.prevent="submit">
      <input v-model="question" placeholder="请输入你的问题..." />
      <button type="submit" :disabled="pending" title="发送问题">
        <SendHorizontal :size="17" />
      </button>
    </form>
  </section>
</template>
