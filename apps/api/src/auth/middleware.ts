import type { NextFunction, Request, Response } from "express";
import { parseCookieHeader, getSessionUserByCookieValue } from "./session.js";
import type { SessionUser } from "./session.js";
import { createDbClient } from "@boots2suits/db";

type Db = ReturnType<typeof createDbClient>["db"];

type AuthContext = {
  db: Db;
  cookieName: string;
  tokenPepper: string;
};

export type AuthenticatedRequest = Request & {
  authUser?: SessionUser;
};

export function buildAuthMiddleware(context: AuthContext) {
  async function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
    try {
      const cookies = parseCookieHeader(req.headers.cookie);
      const cookieValue = cookies[context.cookieName];
      if (!cookieValue) {
        return next();
      }

      const authUser = await getSessionUserByCookieValue(
        context.db,
        cookieValue,
        context.tokenPepper
      );
      if (authUser) {
        req.authUser = authUser;
      }
      return next();
    } catch (error) {
      return next(error);
    }
  }

  function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    if (!req.authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }
    return next();
  }

  function requireRole(roles: SessionUser["role"][]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.authUser) {
        return res.status(401).json({ ok: false, error: "Authentication required." });
      }
      if (!roles.includes(req.authUser.role)) {
        return res.status(403).json({ ok: false, error: "Insufficient role permissions." });
      }
      return next();
    };
  }

  return { optionalAuth, requireAuth, requireRole };
}

