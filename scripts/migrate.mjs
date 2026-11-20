import { config } from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
config({ path: ".env.local", quiet: true });
const test = process.argv.includes("--test");
const url =
  process.env[test ? "TEST_MIGRATION_DATABASE_URL" : "MIGRATION_DATABASE_URL"];
if (!url) throw new Error("Missing migration connection");
if (test && new URL(url).pathname != "/gym_test")
  throw new Error("Expected isolated gym_test database");
const pool = new pg.Pool({ connectionString: url });
try {
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  console.log("Committed migrations applied to " + (test ? "gym_test" : "GYM"));
} finally {
  await pool.end();
}
