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
