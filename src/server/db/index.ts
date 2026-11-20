import "server-only";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { readEnvironment } from "@/lib/env";
export function createDatabase() {
  const env = readEnvironment(process.env);
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 5 });
  return { db: drizzle(pool), pool };
}
