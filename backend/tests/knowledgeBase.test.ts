import { describe, expect, it } from "vitest";
import { applyTelemetry, createSeedState, markOfflineDevices } from "../src/domain/streetlight.js";
import { answerQuestion } from "../src/services/agent.js";
import { getKnowledgeBase, searchKnowledgeBase } from "../src/services/knowledgeBase.js";

describe("local RAG knowledge base", () => {
  it("loads maintenance knowledge entries for the planned topics", () => {
    const entries = getKnowledgeBase();
    const titles = entries.map((entry) => entry.title);

    expect(entries.length).toBeGreaterThanOrEqual(7);
    expect(titles).toEqual(
      expect.arrayContaining([
        "设备离线排查",
        "光照异常排查",
        "自动控灯逻辑",
        "手动控灯与回执重试",
        "告警处理流程",
        "阈值配置说明",
        "MQTT 主题说明"
      ])
    );
  });

  it("uses synonym normalization and device id context in retrieval", () => {
    const state = markOfflineDevices(createSeedState("2026-07-03T08:00:00.000Z"), "2026-07-03T08:03:00.000Z", 90_000);

    const result = searchKnowledgeBase("SL-003 掉线后怎么排查？", state, 3);

    expect(result.extractedDeviceId).toBe("SL-003");
    expect(result.deviceContext).toContain("SL-003");
    expect(result.matches[0]).toMatchObject({
      title: "设备离线排查",
      source: expect.any(String),
      snippet: expect.stringContaining("心跳")
    });
  });

  it("enriches agent answers with knowledge matches and suggested actions", () => {
    const seed = createSeedState("2026-07-03T08:00:00.000Z");
    const state = applyTelemetry(seed, {
      deviceId: "SL-002",
      lightIntensity: 999,
      lampStatus: "OFF",
      online: true,
      timestamp: "2026-07-03T08:01:00.000Z"
    }).state;

    const answer = answerQuestion("SL-002 光照传感器异常怎么处理？", state);

    expect(answer.answer).toContain("SL-002");
    expect(answer.references).toContain("光照异常排查");
    expect(answer.matches?.[0]).toMatchObject({
      title: "光照异常排查",
      score: expect.any(Number)
    });
    expect(answer.suggestedActions).toEqual(
      expect.arrayContaining([expect.stringContaining("传感器"), expect.stringContaining("历史光照")])
    );
  });
});
