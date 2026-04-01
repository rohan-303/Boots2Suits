import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { authSessions, createDbClient, users } from "@boots2suits/db";
import type { Response } from "express";

type Db = ReturnType<typeof createDbClient>["db"];

export type SessionUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: "veteran" | "employer" | "admin";
};

type CreateSessionInput = {
  db: Db;
  userId: string;
  tokenPepper: string;
  sessionTtlDays: number;
};

type CookieConfig = {
  cookieName: string;
  secure: boolean;
};

function hashToken(token: string, pepper: string) {
  return createHash("sha256").update(`${token}.${pepper}`).digest("hex");
}

export function parseCookieHeader(headerValue?: string) {
  if (!headerValue) return {};
  return headerValue.split(";").reduce<Record<string, string>>((acc, pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return acc;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

export async function createSession({
  db,
  userId,
  tokenPepper,
  sessionTtlDays
}: CreateSessionInput) {
  const verifier = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(verifier, tokenPepper);
  const expiresAt = new Date(Date.now() + sessionTtlDays * 24 * 60 * 60 * 1000);

  const [created] = await db
    .insert(authSessions)
    .values({
      userId,
      tokenHash,
      expiresAt
    })
    .returning({ id: authSessions.id, expiresAt: authSessions.expiresAt });

  return {
    cookieValue: `${created.id}.${verifier}`,
    expiresAt: created.expiresAt
  };
}

export function setSessionCookie(
  response: Response,
  cookieConfig: CookieConfig,
  value: string,
  expiresAt: Date
) {
  response.cookie(cookieConfig.cookieName, value, {
    httpOnly: true,
    secure: cookieConfig.secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt
  });
}

export function clearSessionCookie(response: Response, cookieConfig: CookieConfig) {
  response.clearCookie(cookieConfig.cookieName, {
    httpOnly: true,
    secure: cookieConfig.secure,
    sameSite: "lax",
    path: "/"
  });
}

export async function getSessionUserByCookieValue(
  db: Db,
  cookieValue: string,
  tokenPepper: string
): Promise<SessionUser | null> {
  const [sessionId, verifier] = cookieValue.split(".");
  if (!sessionId || !verifier) return null;

  const tokenHash = hashToken(verifier, tokenPepper);
  const now = new Date();

  const [result] = await db
    .select({
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(
      and(
        eq(authSessions.id, sessionId),
        eq(authSessions.tokenHash, tokenHash),
        gt(authSessions.expiresAt, now),
        isNull(authSessions.revokedAt)
      )
    )
    .limit(1);

  if (!result) return null;

  return {
    id: result.userId,
    email: result.email,
    fullName: result.fullName,
    role: result.role
  };
}

export async function revokeSessionByCookieValue(
  db: Db,
  cookieValue: string,
  tokenPepper: string
) {
  const [sessionId, verifier] = cookieValue.split(".");
  if (!sessionId || !verifier) return;

  const tokenHash = hashToken(verifier, tokenPepper);

  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.id, sessionId), eq(authSessions.tokenHash, tokenHash)));
}

