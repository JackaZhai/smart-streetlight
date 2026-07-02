import type { NextFunction, Request, Response } from "express";
import { describe, expect, it } from "vitest";
import { createSeedState } from "../src/domain/streetlight.js";
import type { AppState } from "../src/domain/types.js";
import { requireRole } from "../src/services/authMiddleware.js";
import type { StateStore, StateUpdater } from "../src/services/store.js";

class MemoryStore implements StateStore {
  readonly driver = "json";

  constructor(public state: AppState = createSeedState("2026-07-02T00:00:00.000Z")) {}

  async getState(): Promise<AppState> {
    return this.state;
  }

  async update(updater: StateUpdater): Promise<AppState> {
    this.state = await updater(this.state);
    return this.state;
  }
}

describe("role authorization middleware", () => {
  it("allows users with matching roles", async () => {
    const store = new MemoryStore();
    const req = {} as Request;
    const res = createResponse({ username: "operator", role: "operator" });
    let nextCalled = false;

    await requireRole(["admin", "operator"], {
      store,
      action: "command.dispatch",
      targetType: "device",
      targetId: () => "SL-001"
    })(req, res, (() => {
      nextCalled = true;
    }) as NextFunction);

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(store.state.auditLogs).toEqual([]);
  });

  it("rejects users without matching roles and records a denied audit log", async () => {
    const store = new MemoryStore();
    const req = { params: { id: "SL-999" } } as unknown as Request;
    const res = createResponse({ username: "viewer", role: "viewer" });
    let nextCalled = false;

    await requireRole(["admin"], {
      store,
      action: "device.create",
      targetType: "device",
      targetId: (request) => request.params.id
    })(req, res, (() => {
      nextCalled = true;
    }) as NextFunction);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: "当前账号无权执行该操作" });
    expect(store.state.auditLogs[0]).toMatchObject({
      actorUsername: "viewer",
      actorRole: "viewer",
      action: "device.create",
      targetType: "device",
      targetId: "SL-999",
      result: "DENIED"
    });
  });
});

function createResponse(user: Response["locals"]["user"]): Response & { body?: unknown; statusCode: number } {
  return {
    locals: { user },
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  } as Response & { body?: unknown; statusCode: number };
}
