import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createSeedState } from "../domain/streetlight.js";
import type { AppState } from "../domain/types.js";

type StateUpdater = (state: AppState) => AppState | Promise<AppState>;

export class JsonStateStore {
  private state: AppState | null = null;
  private writeQueue = Promise.resolve();

  constructor(private readonly filePath = process.env.STATE_FILE ?? "./data/state.json") {}

  async getState(): Promise<AppState> {
    if (this.state) {
      return clone(this.state);
    }

    const absolutePath = resolve(this.filePath);
    try {
      const raw = await readFile(absolutePath, "utf8");
      this.state = JSON.parse(raw) as AppState;
    } catch {
      this.state = createSeedState();
      await this.persist();
    }

    return clone(this.state);
  }

  async update(updater: StateUpdater): Promise<AppState> {
    const current = await this.getState();
    this.state = await updater(current);
    await this.persist();
    return clone(this.state);
  }

  private async persist(): Promise<void> {
    if (!this.state) {
      return;
    }

    const absolutePath = resolve(this.filePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    const payload = JSON.stringify(this.state, null, 2);
    this.writeQueue = this.writeQueue.then(() => writeFile(absolutePath, payload, "utf8"));
    await this.writeQueue;
  }
}

function clone(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState;
}
