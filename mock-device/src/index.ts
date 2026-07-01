import mqtt from "mqtt";

type LampStatus = "ON" | "OFF";

interface MockDevice {
  id: string;
  baseLight: number;
  lampStatus: LampStatus;
  phase: number;
}

const mqttUrl = process.env.MQTT_URL ?? "mqtt://localhost:1883";
const devices: MockDevice[] = [
  { id: "SL-001", baseLight: 160, lampStatus: "ON", phase: 0 },
  { id: "SL-002", baseLight: 110, lampStatus: "OFF", phase: 1.2 },
  { id: "SL-003", baseLight: 260, lampStatus: "ON", phase: 2.1 },
  { id: "SL-004", baseLight: 340, lampStatus: "OFF", phase: 2.8 }
];

const client = mqtt.connect(mqttUrl, {
  reconnectPeriod: 3000,
  connectTimeout: 5000
});

client.on("connect", () => {
  console.log(`[mock-device] connected ${mqttUrl}`);
  client.subscribe("streetlight/+/command");
});

client.on("message", (topic, payload) => {
  const [, deviceId] = topic.split("/");
  const device = devices.find((item) => item.id === deviceId);
  if (!device) {
    return;
  }

  const message = JSON.parse(payload.toString()) as { command?: "TURN_ON" | "TURN_OFF"; source?: string };
  if (message.command === "TURN_ON") {
    device.lampStatus = "ON";
  }
  if (message.command === "TURN_OFF") {
    device.lampStatus = "OFF";
  }

  client.publish(
    `streetlight/${device.id}/command/reply`,
    JSON.stringify({
      deviceId: device.id,
      command: message.command,
      result: "SUCCESS",
      timestamp: new Date().toISOString()
    })
  );
  console.log(`[mock-device] ${device.id} executed ${message.command}`);
});

client.on("error", (error) => {
  console.warn("[mock-device] mqtt error", error.message);
});

setInterval(() => {
  const now = Date.now();
  for (const device of devices) {
    const wave = Math.sin(now / 18_000 + device.phase) * 130;
    const lightIntensity = Math.max(20, Math.round(device.baseLight + wave));
    client.publish(
      `streetlight/${device.id}/telemetry`,
      JSON.stringify({
        deviceId: device.id,
        lightIntensity,
        lampStatus: device.lampStatus,
        online: true,
        timestamp: new Date().toISOString()
      })
    );
  }
}, 3000);
