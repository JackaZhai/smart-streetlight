import type { NextFunction, Request, Response } from "express";
import type { Socket } from "socket.io";
import { appendAuditLog } from "../domain/streetlight.js";
import type { AuthUser, UserRole } from "../domain/types.js";
import type { AuthService } from "./auth.js";
import type { StateStore } from "./store.js";
import { readBearerToken } from "../routes/auth.js";

interface RoleGuardOptions {
  store: StateStore;
  action: string;
  targetType: string;
  targetId?: (req: Request) => string | undefined;
}

export function requireAuth(authService: AuthService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = authService.verifyToken(readBearerToken(req.headers.authorization));
    if (!user) {
      res.status(401).json({ message: "未登录或登录已过期" });
      return;
    }
    res.locals.user = user;
    next();
  };
}

export function requireSocketAuth(authService: AuthService) {
  return (socket: Socket, next: (error?: Error) => void): void => {
    const token = typeof socket.handshake.auth.token === "string" ? socket.handshake.auth.token : "";
    const user = authService.verifyToken(token);
    if (!user) {
      next(new Error("unauthorized"));
      return;
    }
    socket.data.user = user;
    next();
  };
}

export function requireRole(allowedRoles: UserRole[], options: RoleGuardOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = res.locals.user as AuthUser | undefined;
    if (!user) {
      res.status(401).json({ message: "未登录或登录已过期" });
      return;
    }

    if (allowedRoles.includes(user.role)) {
      next();
      return;
    }

    await options.store.update((state) =>
      appendAuditLog(state, {
        actor: user,
        action: options.action,
        targetType: options.targetType,
        targetId: options.targetId?.(req),
        result: "DENIED",
        detail: `${user.role} is not allowed`
      })
    );
    res.status(403).json({ message: "当前账号无权执行该操作" });
  };
}
