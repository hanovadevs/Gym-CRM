import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
config({ path: ".env.local", quiet: true });
export default defineConfig({
  schema: ["./src/server/db/schema.ts", "./src/server/db/auth-schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.MIGRATION_DATABASE_URL! },
});
