# MySQL Storage Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the demo JSON persistence path with a product-oriented MySQL 8 storage path while preserving current API, MQTT, Socket.IO, and mock-device behavior.

**Architecture:** Introduce a `StateStore` contract consumed by the API and MQTT bridge. Keep `JsonStateStore` for local fallback, add `MysqlStateStore` backed by MySQL tables and startup initialization, and choose the implementation through environment variables.

**Tech Stack:** Node.js, TypeScript, Express, Socket.IO, mqtt.js, mysql2/promise, Vitest, Docker Compose, MySQL 8, EMQX.

---

## File Structure

- Modify `backend/package.json`: add `mysql2`.
- Modify `backend/src/services/store.ts`: define `StateStore`, keep JSON implementation, add `createStateStore`.
- Create `backend/src/services/mysqlStore.ts`: MySQL connection, schema initialization, seed, transactional state read/write.
- Modify `backend/src/services/mqttBridge.ts`: depend on `StateStore` instead of `JsonStateStore`.
- Modify `backend/src/routes/api.ts`: depend on `StateStore` instead of `JsonStateStore`.
- Modify `backend/src/server.ts`: async startup, storage driver selection, health storage metadata, graceful close.
- Create `backend/tests/store.test.ts`: storage contract tests for JSON and driver factory behavior.
- Create `backend/tests/mysqlStore.test.ts`: optional MySQL integration tests gated by `DATABASE_URL`.
- Modify `deploy/docker-compose.yml`: add MySQL 8 service, data volume, and conservative healthcheck.
- Create `.env.example`: document backend, MQTT, and MySQL variables.
- Modify `README.md`, `docs/系统架构设计.md`, and `docs/测试记录.md`: document MySQL product path and Spark verification.

## Task 1: Storage Contract And JSON Store

**Files:**
- Modify: `backend/src/services/store.ts`
- Create: `backend/tests/store.test.ts`

- [ ] **Step 1: Write failing tests for the storage contract and factory**

Add tests that import the not-yet-existing `createStateStore` and `StateStore` contract:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { JsonStateStore, createStateStore } from "../src/services/store.js";

const cleanupPaths: string[] = [];

afterEach(async () => {
  delete process.env.STORAGE_DRIVER;
  delete process.env.DATABASE_URL;
  await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("StateStore contract", () => {
  it("seeds and persists JSON state updates", async () => {
    const directory = await mkdtemp(join(tmpdir(), "streetlight-store-"));
    cleanupPaths.push(directory);
    const store = new JsonStateStore(join(directory, "state.json"));

    const seeded = await store.getState();
    expect(seeded.devices).toHaveLength(4);

    await store.update((state) => {
      state.devices[0].name = "主干道 A1";
      return state;
    });

    const reopened = new JsonStateStore(join(directory, "state.json"));
    const state = await reopened.getState();
    expect(state.devices[0].name).toBe("主干道 A1");
  });

  it("creates JSON store when no MySQL database URL is configured", () => {
    const store = createStateStore();
    expect(store.driver).toBe("json");
  });

  it("requires DATABASE_URL when MySQL storage is explicitly selected", () => {
    process.env.STORAGE_DRIVER = "mysql";
    expect(() => createStateStore()).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 2: Verify the test fails for the right reason**

Run:

```bash
npm --workspace backend test -- backend/tests/store.test.ts
```

Expected: FAIL because `createStateStore` does not exist.

- [ ] **Step 3: Implement the storage contract minimally**

Update `backend/src/services/store.ts` to export:

```ts
export type StorageDriver = "json" | "mysql";
export type StateUpdater = (state: AppState) => AppState | Promise<AppState>;

export interface StateStore {
  readonly driver: StorageDriver;
  getState(): Promise<AppState>;
  update(updater: StateUpdater): Promise<AppState>;
  close?(): Promise<void>;
}
```

Make `JsonStateStore implements StateStore`, set `readonly driver = "json"`, and add `createStateStore()` that returns JSON by default and throws if `STORAGE_DRIVER=mysql` without `DATABASE_URL`.

- [ ] **Step 4: Run the contract tests**

Run:

```bash
npm --workspace backend test -- backend/tests/store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/store.ts backend/tests/store.test.ts
git commit -m "test: define state store contract"
```

## Task 2: MySQL Store Implementation

**Files:**
- Modify: `backend/package.json`
- Modify: `package-lock.json`
- Create: `backend/src/services/mysqlStore.ts`
- Create: `backend/tests/mysqlStore.test.ts`
- Modify: `backend/src/services/store.ts`

- [ ] **Step 1: Add mysql2 dependency**

Run:

```bash
npm --workspace backend install mysql2
```

Expected: `backend/package.json` and `package-lock.json` include `mysql2`.

- [ ] **Step 2: Write gated MySQL integration tests**

Create `backend/tests/mysqlStore.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MysqlStateStore } from "../src/services/mysqlStore.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run("MysqlStateStore", () => {
  it("initializes schema, seeds state, and persists updates", async () => {
    const store = new MysqlStateStore({
      databaseUrl: databaseUrl!,
      tablePrefix: `test_${randomUUID().replaceAll("-", "_")}_`
    });

    try {
      await store.init();
      const seeded = await store.getState();
      expect(seeded.devices).toHaveLength(4);

      await store.update((state) => {
        state.devices[0].location = "MySQL 持久化测试点位";
        return state;
      });

      const state = await store.getState();
      expect(state.devices[0].location).toBe("MySQL 持久化测试点位");
    } finally {
      await store.dropSchema();
      await store.close();
    }
  });
});
```

- [ ] **Step 3: Verify the MySQL test fails before implementation**

Run without database:

```bash
npm --workspace backend test -- backend/tests/mysqlStore.test.ts
```

Expected: SKIP.

Run with `TEST_DATABASE_URL` when MySQL is available:

```bash
TEST_DATABASE_URL=mysql://streetlight:streetlight_pass@127.0.0.1:3307/smart_streetlight npm --workspace backend test -- backend/tests/mysqlStore.test.ts
```

Expected before implementation: FAIL because `MysqlStateStore` does not exist.

- [ ] **Step 4: Implement `MysqlStateStore`**

Create `backend/src/services/mysqlStore.ts` with these behaviors:

- connect using `mysql2/promise`
- create five tables if missing
- seed from `createSeedState()` when no devices exist
- load full `AppState`
- write full `AppState` inside a transaction
- retain only the latest 240 readings
- support `close()` and `dropSchema()` for tests

- [ ] **Step 5: Wire factory to MySQL**

Update `createStateStore()` so `STORAGE_DRIVER=mysql` returns `new MysqlStateStore({ databaseUrl })` and default behavior uses MySQL if `DATABASE_URL` is present and `STORAGE_DRIVER` is not `json`.

- [ ] **Step 6: Run MySQL tests**

Run with a MySQL container or Spark MySQL:

```bash
TEST_DATABASE_URL=mysql://streetlight:streetlight_pass@127.0.0.1:3307/smart_streetlight npm --workspace backend test -- backend/tests/mysqlStore.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/package.json package-lock.json backend/src/services/store.ts backend/src/services/mysqlStore.ts backend/tests/mysqlStore.test.ts
git commit -m "feat: add mysql state store"
```

## Task 3: API, MQTT, And Server Integration

**Files:**
- Modify: `backend/src/routes/api.ts`
- Modify: `backend/src/services/mqttBridge.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Write failing server-level expectation**

Extend `backend/tests/store.test.ts` with:

```ts
it("uses MySQL store when DATABASE_URL is configured", () => {
  process.env.DATABASE_URL = "mysql://user:pass@127.0.0.1:3306/smart_streetlight";
  const store = createStateStore();
  expect(store.driver).toBe("mysql");
});
```

Expected before wiring: FAIL or throw if MySQL factory is incomplete.

- [ ] **Step 2: Replace concrete `JsonStateStore` types**

Use `StateStore` in API and MQTT bridge option types.

- [ ] **Step 3: Make server startup async**

Update server startup so it calls:

```ts
const store = createStateStore();
await store.init?.();
```

If `init` is not on the interface, narrow by checking property existence.

- [ ] **Step 4: Extend `/health`**

Return:

```json
{
  "ok": true,
  "service": "smart-streetlight-backend",
  "storageDriver": "mysql",
  "timestamp": "..."
}
```

- [ ] **Step 5: Close store on shutdown**

Call `await store.close?.()` together with MQTT close.

- [ ] **Step 6: Run tests and typecheck**

```bash
npm --workspace backend test
npm --workspace backend run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/api.ts backend/src/services/mqttBridge.ts backend/src/server.ts backend/tests/store.test.ts
git commit -m "feat: wire backend storage driver"
```

## Task 4: Compose, Env, And Docs

**Files:**
- Modify: `deploy/docker-compose.yml`
- Create: `.env.example`
- Modify: `README.md`
- Modify: `docs/系统架构设计.md`
- Modify: `docs/测试记录.md`

- [ ] **Step 1: Add MySQL service to compose**

Add a `mysql` service using MySQL 8, persistent volume, port `3307:3306`, and healthcheck.

- [ ] **Step 2: Add `.env.example`**

Include:

```env
PORT=4000
CORS_ORIGIN=http://localhost:5173
MQTT_URL=mqtt://127.0.0.1:1883
STORAGE_DRIVER=mysql
DATABASE_URL=mysql://streetlight:streetlight_pass@127.0.0.1:3307/smart_streetlight
```

- [ ] **Step 3: Update README and architecture docs**

Document MySQL as the product-oriented storage path, with JSON as development fallback.

- [ ] **Step 4: Run docs-free verification**

```bash
npm test
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add deploy/docker-compose.yml .env.example README.md docs/系统架构设计.md docs/测试记录.md
git commit -m "docs: document mysql deployment path"
```

## Task 5: Spark Deployment Verification

**Files:**
- No code files unless a verification issue requires a fix.

- [ ] **Step 1: Push branch to GitHub**

```bash
git push origin codex/mysql-storage-upgrade
```

- [ ] **Step 2: Update Spark checkout**

On Spark:

```bash
cd /home/cavin-dgx/Desktop/smart-streetlight
git fetch origin
git checkout codex/mysql-storage-upgrade
npm ci
```

- [ ] **Step 3: Ensure EMQX and MySQL images are available**

Use existing EMQX image tag workaround if Docker Hub is blocked. Pull MySQL 8 from a reachable domestic mirror and tag it as the compose image if needed.

- [ ] **Step 4: Start infrastructure**

```bash
docker compose -f deploy/docker-compose.yml up -d
```

- [ ] **Step 5: Run validation**

```bash
npm test
npm run typecheck
npm run build
STORAGE_DRIVER=mysql DATABASE_URL=mysql://streetlight:streetlight_pass@127.0.0.1:3307/smart_streetlight PORT=4100 MQTT_URL=mqtt://127.0.0.1:1883 npm --workspace backend run dev
MQTT_URL=mqtt://127.0.0.1:1883 npm --workspace mock-device run dev
curl -sS http://127.0.0.1:4100/health
curl -sS http://127.0.0.1:4100/api/overview
```

Expected:

- `/health` reports `storageDriver=mysql`.
- `/api/overview` returns devices and latest readings after mock telemetry.
- Restarting backend preserves MySQL data.

- [ ] **Step 6: Commit any final verification doc update**

If Spark verification details change docs, commit:

```bash
git add docs/测试记录.md
git commit -m "docs: record spark mysql verification"
```
