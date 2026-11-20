import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import pg from "pg";
const admin = new pg.Client({
  host: "localhost",
  database: "GYM",
  user: "postgres",
  password: process.env.PG_ADMIN_PASSWORD,
});
await admin.connect();
const runtime = randomBytes(30).toString("hex"),
  migration = randomBytes(30).toString("hex");
for (const [role, password] of [
  ["gym_runtime", runtime],
  ["gym_migrator", migration],
]) {
  const exists = await admin.query("select 1 from pg_roles where rolname=$1", [
    role,
  ]);
  if (exists.rowCount)
    throw new Error("Role already exists; refusing to replace credentials");
  await admin.query(
    `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
  );
}
await admin.query(
  'GRANT CONNECT ON DATABASE "GYM" TO gym_runtime, gym_migrator',
);
await admin.query('GRANT CREATE ON DATABASE "GYM" TO gym_migrator');
const exists = await admin.query(
  "select 1 from pg_database where datname='gym_test'",
);
if (exists.rowCount) throw new Error("Test database exists; refusing to reuse");
await admin.query("CREATE DATABASE gym_test OWNER gym_migrator");
await admin.end();
writeFileSync(
  ".env.local",
  `APP_ENV=development\nAPP_URL=http://localhost:3000\nDEMO_MODE=true\nDATABASE_URL=postgresql://gym_runtime:${runtime}@localhost:5432/GYM\nMIGRATION_DATABASE_URL=postgresql://gym_migrator:${migration}@localhost:5432/GYM\nTEST_DATABASE_URL=postgresql://gym_runtime:${runtime}@localhost:5432/gym_test\nTEST_MIGRATION_DATABASE_URL=postgresql://gym_migrator:${migration}@localhost:5432/gym_test\nBETTER_AUTH_URL=http://localhost:3000\nBETTER_AUTH_SECRET=${randomBytes(48).toString("hex")}\n`,
);
console.log(
  "Restricted roles, separate test database and ignored local configuration created.",
);
