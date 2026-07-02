import { Router } from "express";
import type { AuthService } from "../services/auth.js";

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  router.post("/login", async (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const session = await authService.login(username, password);
    if (!session) {
      res.status(401).json({ message: "用户名或密码错误" });
      return;
    }
    res.json(session);
  });

  router.get("/me", (req, res) => {
    const user = authService.verifyToken(readBearerToken(req.headers.authorization));
    if (!user) {
      res.status(401).json({ message: "未登录或登录已过期" });
      return;
    }
    res.json({ user });
  });

  return router;
}

export function readBearerToken(authorization: unknown): string {
  if (typeof authorization !== "string") {
    return "";
  }
  const [scheme, token] = authorization.split(" ");
  return scheme === "Bearer" && token ? token : "";
}
