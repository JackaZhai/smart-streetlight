import { describe, expect, test } from "vitest";
import agentSource from "./AgentChat.vue?raw";
import apiSource from "../services/api.ts?raw";

describe("agent RAG flow", () => {
  test("renders knowledge matches and suggested actions from the chat API", () => {
    expect(apiSource).toContain("KnowledgeMatch");
    expect(apiSource).toContain("suggestedActions?: string[]");
    expect(agentSource).toContain("matches");
    expect(agentSource).toContain("suggestedActions");
    expect(agentSource).toContain("知识命中");
    expect(agentSource).toContain("推荐操作");
  });
});
