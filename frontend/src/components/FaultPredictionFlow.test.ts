import { describe, expect, test } from "vitest";
import appSource from "../App.vue?raw";
import deviceTableSource from "./DeviceTable.vue?raw";
import apiSource from "../services/api.ts?raw";

describe("fault prediction frontend flow", () => {
  test("wires fault predictions to device ledger and detail views", () => {
    expect(apiSource).toContain("FaultPrediction");
    expect(apiSource).toContain("fetchFaultPredictions");
    expect(apiSource).toContain("fetchDeviceFaultPredictions");
    expect(appSource).toContain("selectedFaultPredictions");
    expect(appSource).toContain("riskLevelText");
    expect(appSource).toContain("故障预判");
    expect(deviceTableSource).toContain("faultPredictions");
    expect(deviceTableSource).toContain("highestRiskFor");
  });
});
