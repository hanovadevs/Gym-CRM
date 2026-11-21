import { config } from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { databaseConnection } from "./database-connection.mjs";
config({ path: ".env.local", quiet: true });
const test = process.argv.includes("--test");
const url =
  process.env[test ? "TEST_MIGRATION_DATABASE_URL" : "MIGRATION_DATABASE_URL"];
if (!url) throw new Error("Missing migration connection");
if (test && new URL(url).pathname != "/gym_test")
  throw new Error("Expected isolated gym_test database");
const pool = new pg.Pool(
  databaseConnection(url, process.env.DATABASE_SSL_CA_BASE64),
);
try {
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  console.log("Committed migrations applied to " + decodeURIComponent(new URL(url).pathname.slice(1)));
} finally {
  await pool.end();
}
