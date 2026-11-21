import "server-only";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { readEnvironment } from "@/lib/env";
const shared = globalThis as typeof globalThis & {
  mojymDatabase?: { url: string; pool: Pool; db: ReturnType<typeof drizzle> };
};
export function createDatabase() {
  const env = readEnvironment(process.env);
  if (shared.mojymDatabase) {
    if (shared.mojymDatabase.url !== env.DATABASE_URL)
      throw new Error("Database configuration changed; restart the server");
    return shared.mojymDatabase;
  }
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });
  shared.mojymDatabase = { url: env.DATABASE_URL, db: drizzle(pool), pool };
  return shared.mojymDatabase;
}
