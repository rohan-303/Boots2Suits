import express from "express";
import { createDbClient } from "@boots2suits/db";
import { createAuthRouter } from "./auth/routes.js";
import { createEmployerRouter } from "./employer/routes.js";
import { createMatchingRouter } from "./matching/routes.js";
import { createVeteranRouter } from "./veteran/routes.js";
import { env } from "./config/env.js";

const app = express();
const { db, pool } = createDbClient(env.DATABASE_URL);

type DbHealth = {
  ok: boolean;
  checkedAt: string;
  error?: string;
};

let dbHealth: DbHealth = {
  ok: false,
  checkedAt: new Date().toISOString(),
  error: "Database not checked yet."
};

app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", env.CORS_ORIGIN);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

app.use(
  "/auth",
  createAuthRouter({
    db,
    cookieName: env.AUTH_COOKIE_NAME,
    cookieSecure: env.AUTH_COOKIE_SECURE,
    tokenPepper: env.AUTH_TOKEN_PEPPER,
    sessionTtlDays: env.AUTH_SESSION_TTL_DAYS
  })
);

app.use(
  "/veteran",
  createVeteranRouter({
    db,
    cookieName: env.AUTH_COOKIE_NAME,
    tokenPepper: env.AUTH_TOKEN_PEPPER
  })
);

app.use(
  "/employer",
  createEmployerRouter({
    db,
    cookieName: env.AUTH_COOKIE_NAME,
    tokenPepper: env.AUTH_TOKEN_PEPPER
  })
);

app.use(
  "/matching",
  createMatchingRouter({
    db,
    cookieName: env.AUTH_COOKIE_NAME,
    tokenPepper: env.AUTH_TOKEN_PEPPER
  })
);

async function checkDatabaseConnectivity(): Promise<DbHealth> {
  try {
    await pool.query("select 1");
    dbHealth = { ok: true, checkedAt: new Date().toISOString() };
  } catch (error) {
    dbHealth = {
      ok: false,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown database error"
    };
  }

  return dbHealth;
}

app.get("/health", async (_req, res) => {
  const currentDbHealth = await checkDatabaseConnectivity();
  const statusCode = currentDbHealth.ok ? 200 : 503;

  res.status(statusCode).json({
    ok: currentDbHealth.ok,
    service: "api",
    database: currentDbHealth,
    uptimeSeconds: Math.round(process.uptime())
  });
});

async function start() {
  const startupDbHealth = await checkDatabaseConnectivity();
  if (!startupDbHealth.ok) {
    console.error("API startup aborted: database connectivity check failed.", startupDbHealth);
    process.exit(1);
  }

  const server = app.listen(env.API_PORT, () => {
    console.log(`API listening on http://localhost:${env.API_PORT}`);
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    console.log(`Received ${signal}. Shutting down API...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch(async (error) => {
  console.error("API startup failed.", error);
  await pool.end();
  process.exit(1);
});
