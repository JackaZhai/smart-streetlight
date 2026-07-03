import { afterEach, describe, expect, it, vi } from "vitest";
import { createSeedState, markOfflineDevices } from "../src/domain/streetlight.js";
import { answerQuestion } from "../src/services/agent.js";

describe("DeepSeek-backed agent answers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls DeepSeek with RAG context when an API key is configured", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-deepseek-key");
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v4-flash");
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com");

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          model: "deepseek-v4-flash",
          choices: [
            {
              message: {
                role: "assistant",
                content: "DeepSeek 生成的设备离线排查建议。"
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const state = markOfflineDevices(createSeedState("2026-07-03T08:00:00.000Z"), "2026-07-03T08:03:00.000Z");

    const answer = await answerQuestion("SL-003 掉线后怎么排查？", state);

    expect(answer).toMatchObject({
      answer: "DeepSeek 生成的设备离线排查建议。",
      provider: "deepseek",
      model: "deepseek-v4-flash"
    });
    expect(answer.references).toContain("设备离线排查");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer test-deepseek-key"
    });
    const body = JSON.parse(String(init.body)) as {
      model: string;
      stream: boolean;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.stream).toBe(false);
    expect(body.messages[0]).toMatchObject({ role: "system" });
    expect(body.messages[1].content).toContain("用户问题：SL-003 掉线后怎么排查？");
    expect(body.messages[1].content).toContain("知识命中");
    expect(body.messages[1].content).toContain("设备上下文");
    expect(body.messages[1].content).toContain("故障预判");
  });

  it("falls back to local RAG when DeepSeek is not configured", async () => {
    const answer = await answerQuestion("SL-002 光照传感器异常怎么处理？", createSeedState("2026-07-03T08:00:00.000Z"));

    expect(answer.provider).toBe("local");
    expect(answer.references).toContain("光照异常排查");
    expect(answer.answer).toContain("光照");
  });
});
