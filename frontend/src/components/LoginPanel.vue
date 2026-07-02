<script setup lang="ts">
import { LockKeyhole, LogIn } from "lucide-vue-next";
import { reactive, ref } from "vue";
import { login, type AuthSession } from "../services/api";

const emit = defineEmits<{
  authenticated: [session: AuthSession];
}>();

const form = reactive({
  username: "admin",
  password: ""
});
const pending = ref(false);
const errorMessage = ref("");

async function submit() {
  pending.value = true;
  errorMessage.value = "";
  try {
    const session = await login(form.username, form.password);
    emit("authenticated", session);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "登录失败";
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <main class="login-shell">
    <section class="login-panel">
      <div class="login-mark"><LockKeyhole :size="24" /></div>
      <h1>智慧路灯节能系统</h1>
      <p>请输入运维账号后进入设备监控与控制台。</p>

      <form class="login-form" @submit.prevent="submit">
        <label>
          账号
          <input v-model.trim="form.username" autocomplete="username" required />
        </label>
        <label>
          密码
          <input v-model="form.password" type="password" autocomplete="current-password" required />
        </label>
        <button class="primary-action" type="submit" :disabled="pending">
          <LogIn :size="17" />
          {{ pending ? "登录中" : "登录" }}
        </button>
      </form>

      <div v-if="errorMessage" class="error-state">{{ errorMessage }}</div>
    </section>
  </main>
</template>
