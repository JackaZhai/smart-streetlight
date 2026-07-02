import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    const statePath = join(directory, "state.json");
    const store = new JsonStateStore(statePath);

    const seeded = await store.getState();
    expect(seeded.devices).toHaveLength(4);

    await store.update((state) => {
      state.devices[0].name = "主干道 A1";
      return state;
    });

    const reopened = new JsonStateStore(statePath);
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

  it("uses MySQL store when DATABASE_URL is configured", () => {
    process.env.DATABASE_URL = "mysql://user:pass@127.0.0.1:3306/smart_streetlight";

    const store = createStateStore();

    expect(store.driver).toBe("mysql");
  });
});
