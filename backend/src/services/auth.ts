import { createHmac, timingSafeEqual } from "node:crypto";

export type UserRole = "admin";

export interface AuthUser {
  username: string;
  role: UserRole;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  expiresAt: string;
}

export interface AuthConfig {
  adminUsername: string;
  adminPassword: string;
  jwtSecret: string;
  tokenTtlSeconds: number;
}

export interface AuthService {
  login(username: string, password: string): Promise<AuthSession | null>;
  verifyToken(token: string): AuthUser | null;
}

interface TokenPayload extends AuthUser {
  exp: number;
}

const header = { alg: "HS256", typ: "JWT" };

export function createAuthService(config: AuthConfig): AuthService {
  return {
    async login(username, password) {
      const normalizedUsername = username.trim();
      if (
        normalizedUsername !== config.adminUsername ||
        !safeEqual(password, config.adminPassword)
      ) {
        return null;
      }

      const expiresAtMs = Date.now() + config.tokenTtlSeconds * 1000;
      const user: AuthUser = { username: config.adminUsername, role: "admin" };
      return {
        token: signToken({ ...user, exp: Math.floor(expiresAtMs / 1000) }, config.jwtSecret),
        user,
        expiresAt: new Date(expiresAtMs).toISOString()
      };
    },

    verifyToken(token) {
      const payload = verifyToken(token, config.jwtSecret);
      if (!payload) {
        return null;
      }
      return {
        username: payload.username,
        role: payload.role
      };
    }
  };
}

export function createAuthServiceFromEnv(env = process.env): AuthService {
  return createAuthService({
    adminUsername: env.ADMIN_USERNAME ?? "admin",
    adminPassword: env.ADMIN_PASSWORD ?? "admin123",
    jwtSecret: env.JWT_SECRET ?? "dev-only-change-me",
    tokenTtlSeconds: Number(env.AUTH_TOKEN_TTL_SECONDS ?? 86_400)
  });
}

function signToken(payload: TokenPayload, secret: string): string {
  const encodedHeader = encodeJson(header);
  const encodedPayload = encodeJson(payload);
  const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token: string, secret: string): TokenPayload | null {
  const [encodedHeader, encodedPayload, signature, extra] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature || extra) {
    return null;
  }

  const expected = sign(`${encodedHeader}.${encodedPayload}`, secret);
  if (!safeEqual(signature, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as TokenPayload;
    if (payload.role !== "admin" || typeof payload.username !== "string" || typeof payload.exp !== "number") {
      return null;
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
