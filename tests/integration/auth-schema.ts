import assert from "node:assert/strict";
import { config } from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "../../src/server/db/auth-schema";
config({ path: ".env.local", quiet: true });
if (new URL(process.env.TEST_DATABASE_URL!).pathname != "/gym_test")
  throw new Error("Isolated test database required");
const client = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL,
});
await client.connect();
try {
  await client.query("BEGIN");
  const adapter = drizzleAdapter(drizzle(client, { schema }), {
    provider: "pg",
    schema,
    schemaName: "app_auth",
  })({});
  const created = await adapter.create<{
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>({
    model: "user",
    data: {
      name: "Adapter Test",
      email: "adapter@example.invalid",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  const found = await adapter.findOne<{ id: string; email: string }>({
    model: "user",
    where: [{ field: "id", value: created.id }],
  });
  assert.equal(found?.email, "adapter@example.invalid");
  await client.query("ROLLBACK");
  console.log(
    "PASS: installed Better Auth Drizzle adapter creates/reads private app_auth user using restricted runtime; rolled back.",
  );
} finally {
  await client.query("ROLLBACK");
  await client.end();
}
