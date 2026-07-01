# Smart Streetlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable first-draft smart streetlight system with frontend dashboard, backend API/MQTT bridge, mock device simulator, docs, and deployment helpers.

**Architecture:** A TypeScript monorepo keeps frontend, backend, and mock-device in one repository. Backend owns state, automation rules, MQTT ingestion, REST API, Socket.IO events, and a local rule-based agent endpoint. Frontend consumes API/socket events and presents an operational Chinese dashboard.

**Tech Stack:** Vue 3, Vite, TypeScript, ECharts, Express, Socket.IO, mqtt.js, Vitest, EMQX Docker.

---

### Task 1: Core Domain And Tests

**Files:**
- Create: `backend/src/domain/types.ts`
- Create: `backend/src/domain/streetlight.ts`
- Create: `backend/tests/streetlight.test.ts`

- [x] Write tests for telemetry ingestion, automatic control, and offline alarms.
- [x] Implement typed state models and pure domain functions.
- [x] Keep automation behavior independent of Express, MQTT, and storage.

### Task 2: Backend API, MQTT, And Realtime Bridge

**Files:**
- Create: `backend/src/server.ts`
- Create: `backend/src/routes/api.ts`
- Create: `backend/src/services/store.ts`
- Create: `backend/src/services/mqttBridge.ts`
- Create: `backend/src/services/agent.ts`

- [x] Expose device, light-history, threshold, command, alarm, overview, and chat endpoints.
- [x] Subscribe to telemetry MQTT topics and publish control commands.
- [x] Broadcast state updates through Socket.IO.
- [x] Persist local demo state to a JSON file under backend runtime data.

### Task 3: Frontend Dashboard

**Files:**
- Create: `frontend/src/App.vue`
- Create: `frontend/src/main.ts`
- Create: `frontend/src/services/api.ts`
- Create: focused components under `frontend/src/components/`
- Create: shared CSS under `frontend/src/styles/`

- [x] Build the operational dashboard as the first screen.
- [x] Include KPI cards, light trend chart, device control, device table, alarm list, and agent chat.
- [x] Use responsive layout without nested cards or marketing sections.
- [x] Wire manual control, threshold update, alarm handling, and chat to backend APIs.

### Task 4: Mock Device And Deployment Helpers

**Files:**
- Create: `mock-device/src/index.ts`
- Create: `deploy/docker-compose.yml`
- Create: `.env.example`

- [x] Simulate multiple streetlight devices publishing telemetry over MQTT.
- [x] Subscribe to command topics and return command replies.
- [x] Provide EMQX Docker setup for local MQTT broker.

### Task 5: Repository, Docs, And Verification

**Files:**
- Create: root `package.json`, workspace configs, `.gitignore`, `README.md`
- Create: `docs/系统架构设计.md`, `docs/接口设计.md`, `docs/MQTT主题设计.md`, `docs/测试记录.md`

- [x] Document install, run, test, and demo flow.
- [x] Run package install, tests, and builds when network/dependencies allow.
- [x] Initialize a new git repository, commit code, and push to a public GitHub repository if authentication permits.
