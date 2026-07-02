import type { NextFunction, Request, Response } from "express";
import type { Socket } from "socket.io";
import type { AuthService } from "./auth.js";
import { readBearerToken } from "../routes/auth.js";

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
