import { describe, expect, it } from "vitest";
import { createAuthService } from "../src/services/auth.js";

describe("auth service", () => {
  it("issues and verifies signed admin tokens", async () => {
    const auth = createAuthService({
      adminUsername: "admin",
      adminPassword: "secure-pass",
      jwtSecret: "test-secret",
      tokenTtlSeconds: 60
    });

    const session = await auth.login("admin", "secure-pass");

    expect(session).not.toBeNull();
    expect(session?.user).toEqual({ username: "admin", role: "admin" });
    expect(auth.verifyToken(session!.token)).toEqual({ username: "admin", role: "admin" });
  });

  it("issues signed tokens for configured operator and viewer users", async () => {
    const auth = createAuthService({
      adminUsername: "admin",
      adminPassword: "secure-pass",
      jwtSecret: "test-secret",
      tokenTtlSeconds: 60,
      users: [
        { username: "operator", password: "operator-pass", role: "operator" },
        { username: "viewer", password: "viewer-pass", role: "viewer" }
      ]
    });

    const operatorSession = await auth.login("operator", "operator-pass");
    const viewerSession = await auth.login("viewer", "viewer-pass");

    expect(operatorSession?.user).toEqual({ username: "operator", role: "operator" });
    expect(viewerSession?.user).toEqual({ username: "viewer", role: "viewer" });
    expect(auth.verifyToken(operatorSession!.token)).toEqual({ username: "operator", role: "operator" });
    expect(auth.verifyToken(viewerSession!.token)).toEqual({ username: "viewer", role: "viewer" });
  });

  it("rejects invalid credentials and tampered tokens", async () => {
    const auth = createAuthService({
      adminUsername: "admin",
      adminPassword: "secure-pass",
      jwtSecret: "test-secret",
      tokenTtlSeconds: 60
    });

    const session = await auth.login("admin", "wrong-pass");
    expect(session).toBeNull();

    const valid = await auth.login("admin", "secure-pass");
    expect(auth.verifyToken(`${valid!.token}tampered`)).toBeNull();
  });
});
