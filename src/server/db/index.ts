import "server-only";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { readEnvironment } from "@/lib/env";
import { databaseConnection } from "../../../scripts/database-connection.mjs";
const shared = globalThis as typeof globalThis & {
  mojymDatabase?: { url: string; pool: Pool; db: ReturnType<typeof drizzle> };
};
export function createDatabase() {
  const env = readEnvironment(process.env);
  if (shared.mojymDatabase) {
    if (shared.mojymDatabase.url !== env.DATABASE_URL)
      throw new Error("Database configuration changed; restart the server");
    return { db: shared.mojymDatabase.db, pool: shared.mojymDatabase.pool };
  }
  const pool = new Pool({
    ...databaseConnection(env.DATABASE_URL, process.env.DATABASE_SSL_CA_BASE64),
    max: process.env.VERCEL === "1" ? 1 : 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });
  shared.mojymDatabase = { url: env.DATABASE_URL, db: drizzle(pool), pool };
  return { db: shared.mojymDatabase.db, pool: shared.mojymDatabase.pool };
}
