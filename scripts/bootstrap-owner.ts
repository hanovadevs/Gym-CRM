import { config } from "dotenv";
import pg from "pg";
import { bootstrapOwner } from "../src/server/auth/bootstrap";
config({ path: ".env.local", quiet: true });
if (
  process.env.APP_ENV === "production" ||
  process.env.NODE_ENV === "production"
)
  throw new Error(
    "Local setup only; production provisioning requires a separate reviewed procedure",
  );
if (
  !process.env.MIGRATION_DATABASE_URL ||
  !process.env.BETTER_AUTH_SECRET ||
  !process.env.APP_URL
)
  throw new Error("Missing administrative setup configuration");
const client = new pg.Client({
  connectionString: process.env.MIGRATION_DATABASE_URL,
});
await client.connect();
try {
  await bootstrapOwner(
    client,
    {
      name: process.env.OWNER_NAME,
      email: process.env.OWNER_EMAIL,
      password: process.env.OWNER_PASSWORD,
      gymName: process.env.GYM_NAME,
      slug: process.env.GYM_SLUG,
    },
    { secret: process.env.BETTER_AUTH_SECRET, baseURL: process.env.APP_URL },
  );
  console.log(
    "Owner and workspace created. Sign in with your chosen credentials.",
  );
} finally {
  await client.end();
}
