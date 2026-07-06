import { describe, expect, test } from "vitest";
import appSource from "../App.vue?raw";
import alarmListSource from "./AlarmList.vue?raw";
import agentChatSource from "./AgentChat.vue?raw";
import deviceTableSource from "./DeviceTable.vue?raw";
import trendChartSource from "./TrendChart.vue?raw";

describe("frontend action binding audit", () => {
  test("removes decorative buttons that do not have a real click path", () => {
    expect(deviceTableSource).not.toContain('title="刷新"');
    expect(appSource).not.toContain('class="conversation active" type="button"');
    expect(appSource).not.toContain('class="new-chat" type="button"');
    expect(appSource).not.toContain('<button type="button"><ListFilter');
    expect(appSource).not.toContain('<button type="button"><Search');
    expect(appSource).not.toContain('<button type="button"><SlidersHorizontal');
    expect(appSource).not.toContain('<button type="button"><FileText');
  });

  test("keeps visible action buttons wired to frontend or backend behavior", () => {
    expect(trendChartSource).toContain("function downloadChartImage");
    expect(trendChartSource).toContain('@click="downloadChartImage"');
    expect(trendChartSource).toContain("downloadMessage");
    expect(trendChartSource).toContain("趋势图已生成");
    expect(alarmListSource).toContain("show-more");
    expect(alarmListSource).toContain("@click=\"emit('show-more')\"");
    expect(appSource).toContain("@show-more=\"activeSection = 'alarms'\"");
    expect(agentChatSource).toContain("askSuggestedAction");
    expect(agentChatSource).toContain('@click="askSuggestedAction(item)"');
    expect(deviceTableSource).toContain('@click.stop="emit(\'open-detail\', device.id)">控制</button>');
  });
});
