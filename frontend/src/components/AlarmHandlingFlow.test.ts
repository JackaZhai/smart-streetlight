import { describe, expect, test } from "vitest";
import appSource from "../App.vue?raw";
import apiSource from "../services/api.ts?raw";

describe("alarm handling page flow", () => {
  test("wires filters, row selection, and alarm handling to real state", () => {
    expect(apiSource).toContain("handleAlarm");
    expect(appSource).toContain("alarmLevelFilter");
    expect(appSource).toContain("alarmStatusFilter");
    expect(appSource).toContain("alarmStartDate");
    expect(appSource).toContain("alarmEndDate");
    expect(appSource).toContain("filteredAlarms");
    expect(appSource).toContain("selectedAlarmId");
    expect(appSource).toContain("alarmHandleRemark");
    expect(appSource).toContain("handleSelectedAlarm");
    expect(appSource).toContain("handleAlarm(selectedAlarm.value.id, {");
    expect(appSource).toContain("remark: alarmHandleRemark.value.trim()");
    expect(appSource).toContain("placeholder=\"填写处理过程、现场反馈或后续动作\"");
    expect(appSource).toContain("handledBy");
    expect(appSource).toContain("handleRemark");
    expect(appSource).toContain("warning: alarms.filter");
    expect(appSource).toContain("<span>中优先级</span><strong>{{ alarmStats.warning }}</strong>");
    expect(appSource).toContain("type=\"date\"");
    expect(appSource).toContain("@click=\"selectAlarm(alarm.id)\"");
    expect(appSource).toContain("@click=\"handleSelectedAlarm\"");
    expect(appSource).toContain(
      ":disabled=\"!canOperate || selectedAlarm.handled || alarmHandlePending || !alarmHandleRemark.trim()\""
    );
  });
});
