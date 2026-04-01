import { eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { createDbClient, userAuthCredentials, users } from "@boots2suits/db";
import { hashPassword, verifyPassword } from "./password.js";
import {
  clearSessionCookie,
  createSession,
  parseCookieHeader,
  revokeSessionByCookieValue
} from "./session.js";
import { buildAuthMiddleware, type AuthenticatedRequest } from "./middleware.js";

type Db = ReturnType<typeof createDbClient>["db"];

type AuthRouterOptions = {
  db: Db;
  cookieName: string;
  cookieSecure: boolean;
  tokenPepper: string;
  sessionTtlDays: number;
};

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1).max(120),
  role: z.enum(["veteran", "employer"])
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

export function createAuthRouter(options: AuthRouterOptions) {
  const router = Router();
  const auth = buildAuthMiddleware({
    db: options.db,
    cookieName: options.cookieName,
    tokenPepper: options.tokenPepper
  });

  router.use(auth.optionalAuth);

  router.post("/signup", async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Invalid signup payload." });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const passwordHash = hashPassword(parsed.data.password);

    const existing = await options.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ ok: false, error: "Email already exists." });
    }

    const user = await options.db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(users)
        .values({
          email,
          fullName: parsed.data.fullName.trim(),
          role: parsed.data.role,
          status: "active"
        })
        .returning({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          role: users.role
        });

      await tx.insert(userAuthCredentials).values({
        userId: createdUser.id,
        passwordHash
      });

      return createdUser;
    });

    const session = await createSession({
      db: options.db,
      userId: user.id,
      tokenPepper: options.tokenPepper,
      sessionTtlDays: options.sessionTtlDays
    });

    res.cookie(options.cookieName, session.cookieValue, {
      httpOnly: true,
      secure: options.cookieSecure,
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt
    });

    return res.status(201).json({
      ok: true,
      user
    });
  });

  router.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Invalid login payload." });
    }

    const email = parsed.data.email.trim().toLowerCase();

    const [record] = await options.db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        status: users.status,
        passwordHash: userAuthCredentials.passwordHash
      })
      .from(users)
      .innerJoin(userAuthCredentials, eq(userAuthCredentials.userId, users.id))
      .where(eq(users.email, email))
      .limit(1);

    if (!record) {
      return res.status(401).json({ ok: false, error: "Invalid email or password." });
    }

    if (record.status !== "active") {
      return res.status(403).json({ ok: false, error: "User account is inactive." });
    }

    const validPassword = verifyPassword(parsed.data.password, record.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ ok: false, error: "Invalid email or password." });
    }

    const session = await createSession({
      db: options.db,
      userId: record.id,
      tokenPepper: options.tokenPepper,
      sessionTtlDays: options.sessionTtlDays
    });

    res.cookie(options.cookieName, session.cookieValue, {
      httpOnly: true,
      secure: options.cookieSecure,
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt
    });

    return res.json({
      ok: true,
      user: {
        id: record.id,
        email: record.email,
        fullName: record.fullName,
        role: record.role
      }
    });
  });

  router.post("/logout", auth.requireAuth, async (req, res) => {
    const cookies = parseCookieHeader(req.headers.cookie);
    const cookieValue = cookies[options.cookieName];
    if (cookieValue) {
      await revokeSessionByCookieValue(options.db, cookieValue, options.tokenPepper);
    }
    clearSessionCookie(res, {
      cookieName: options.cookieName,
      secure: options.cookieSecure
    });

    return res.json({ ok: true });
  });

  router.get("/me", auth.requireAuth, async (req: AuthenticatedRequest, res) => {
    return res.json({
      ok: true,
      user: req.authUser
    });
  });

  router.get("/role-test/veteran", auth.requireRole(["veteran", "admin"]), (_req, res) => {
    return res.json({ ok: true, message: "Veteran route access granted." });
  });

  router.get("/role-test/employer", auth.requireRole(["employer", "admin"]), (_req, res) => {
    return res.json({ ok: true, message: "Employer route access granted." });
  });

  router.get("/role-test/admin", auth.requireRole(["admin"]), (_req, res) => {
    return res.json({ ok: true, message: "Admin route access granted." });
  });

  return router;
}
