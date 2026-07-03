<script setup lang="ts">
import { LockKeyhole, LogIn } from "lucide-vue-next";
import { computed, reactive, ref } from "vue";
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
const canSubmit = computed(() => !pending.value && form.username.trim().length > 0 && form.password.trim().length > 0);

async function submit() {
  if (!canSubmit.value) {
    return;
  }
  pending.value = true;
  errorMessage.value = "";
  try {
    const session = await login(form.username.trim(), form.password);
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

      <form class="login-form" :aria-busy="pending" @submit.prevent="submit">
        <label>
          账号
          <input v-model.trim="form.username" autocomplete="username" required />
        </label>
        <label>
          密码
          <input v-model="form.password" type="password" autocomplete="current-password" required />
        </label>
        <button class="primary-action" type="submit" :disabled="!canSubmit">
          <LogIn :size="17" />
          {{ pending ? "登录中" : "登录" }}
        </button>
      </form>

      <div class="login-demo-hint">
        <span>默认管理员：admin / admin123</span>
        <span>运维员：operator / operator123</span>
        <span>只读账号：viewer / viewer123</span>
      </div>

      <div v-if="errorMessage" class="error-state" role="alert" aria-live="polite">{{ errorMessage }}</div>
    </section>
  </main>
</template>
