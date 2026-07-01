import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { buildOverview } from "./domain/streetlight.js";
import { createApiRouter } from "./routes/api.js";
import { createMqttBridge } from "./services/mqttBridge.js";
import { JsonStateStore } from "./services/store.js";

const port = Number(process.env.PORT ?? 4000);
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
const mqttUrl = process.env.MQTT_URL ?? "mqtt://localhost:1883";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin
  }
});
const store = new JsonStateStore();
const mqttBridge = createMqttBridge({ mqttUrl, store, io });

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "smart-streetlight-backend",
    timestamp: new Date().toISOString()
  });
});

app.use("/api", createApiRouter({ store, io, mqttBridge }));

io.on("connection", async (socket) => {
  const state = await store.getState();
  socket.emit("state:update", buildOverview(state));
});

httpServer.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
});

process.on("SIGINT", async () => {
  await mqttBridge.close();
  httpServer.close(() => process.exit(0));
});
