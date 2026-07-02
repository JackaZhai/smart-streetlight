import { describe, expect, it } from "vitest";
import {
  parseAgentQuestionPayload,
  parseAlarmHandlePayload,
  parseCommandPayload,
  parseCreateDevicePayload,
  parseDeviceIdParam,
  parseThresholdPayload
} from "../src/services/validation.js";

describe("api validation", () => {
  it("normalizes valid device creation payloads", () => {
    expect(
      parseCreateDevicePayload({
        id: " SL-100 ",
        name: " 主路测试灯 ",
        location: " 南门 "
      })
    ).toEqual({
      id: "SL-100",
      name: "主路测试灯",
      location: "南门"
    });
  });

  it("rejects unsafe device identifiers", () => {
    expect(() => parseDeviceIdParam("../bad")).toThrow(/设备编号/);
    expect(() => parseCreateDevicePayload({ id: "x", name: "短编号" })).toThrow(/设备编号/);
  });

  it("rejects invalid thresholds and commands", () => {
    expect(() => parseThresholdPayload({ lowThreshold: 400, highThreshold: 200, enabled: true })).toThrow(/阈值/);
    expect(() => parseCommandPayload({ command: "REBOOT" })).toThrow(/TURN_ON/);
  });

  it("requires a bounded agent question", () => {
    expect(parseAgentQuestionPayload({ question: "设备离线怎么排查？" })).toEqual({
      question: "设备离线怎么排查？"
    });
    expect(() => parseAgentQuestionPayload({ question: "" })).toThrow(/问题/);
  });

  it("normalizes bounded alarm handling remarks", () => {
    expect(parseAlarmHandlePayload({ remark: " 已通知现场复核 " })).toEqual({
      remark: "已通知现场复核"
    });
    expect(parseAlarmHandlePayload({})).toEqual({});
    expect(() => parseAlarmHandlePayload({ remark: "x".repeat(301) })).toThrow(/处理备注/);
  });
});
