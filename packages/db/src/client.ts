import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export function createDbClient(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  const db = drizzle(pool, { schema });
  return { db, pool };
}

export function createDb(databaseUrl: string) {
  return createDbClient(databaseUrl).db;
}
