import { config } from "dotenv";
import pg from "pg";
import { databaseConnection } from "./database-connection.mjs";
import { bootstrapPlatformAdmin } from "../src/server/platform/bootstrap";
config({ path: ".env.local", quiet: true });
if (!process.env.MIGRATION_DATABASE_URL || !process.env.BETTER_AUTH_SECRET || !process.env.APP_URL)
  throw new Error("Missing operator database, authentication secret or app URL configuration");
const db = new pg.Client(
  databaseConnection(
    process.env.MIGRATION_DATABASE_URL!,
    process.env.DATABASE_SSL_CA_BASE64,
  ),
);
try {
  await db.connect();
  const result = await bootstrapPlatformAdmin(
    db,
    {
      name: process.env.PLATFORM_ADMIN_NAME,
      email: process.env.PLATFORM_ADMIN_EMAIL,
      password: process.env.PLATFORM_ADMIN_PASSWORD,
    },
    { secret: process.env.BETTER_AUTH_SECRET!, baseURL: process.env.APP_URL! },
  );
  console.log(
    result.created
      ? "Platform administrator created. Existing gym owners were preserved."
      : "Platform administrator already exists; password and grants unchanged.",
  );
} finally {
  await db.end();
}
