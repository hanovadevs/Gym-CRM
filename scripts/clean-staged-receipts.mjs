import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { databaseConnection } from "./database-connection.mjs";
config({ path: ".env.local", quiet: true });
const test = process.argv.includes("--test"),
  apply = process.argv.includes("--apply");
const url =
  process.env[test ? "TEST_MIGRATION_DATABASE_URL" : "MIGRATION_DATABASE_URL"];
if (!url)
  throw Error("Migration connection required for staged-file maintenance");
if (test) assert.equal(new URL(url).pathname, "/gym_test");
const pool = new pg.Pool({
  ...databaseConnection(url, process.env.DATABASE_SSL_CA_BASE64),
  max: 1,
});
const client = await pool.connect();
try {
  await client.query("begin");
  // The FK prevents a concurrent attachment from leaving a dangling pointer.
  // Linked receipts, including reversed expense receipts, are never candidates.
  const candidates = (
    await client.query(
      "select f.id,f.organization_id,f.size_bytes,f.sha256 from gym.private_files f where f.uploaded_at<clock_timestamp()-interval '24 hours' and not exists(select 1 from gym.expenses e where e.organization_id=f.organization_id and e.file_id=f.id) order by f.id limit 500 for update of f",
    )
  ).rows;
  const identity = (
    await client.query("select current_database() db,current_user operator")
  ).rows[0];
  if (!apply) {
    await client.query("rollback");
    console.log(
      JSON.stringify({
        mode: "dry-run",
        candidates: candidates.length,
        bytes: candidates.reduce((sum, row) => sum + row.size_bytes, 0),
      }),
    );
  } else {
    await mkdir(".local/receipt-maintenance", { recursive: true });
    const manifest = {
      at: new Date().toISOString(),
      ...identity,
      retentionHours: 24,
      candidates,
    };
    const path = ".local/receipt-maintenance/" + Date.now() + ".json";
    // Keep the exact candidate IDs/checksums before deletion; never include bytes
    // or credentials. This is a database-operator log, not a fabricated app actor.
    await writeFile(path, JSON.stringify(manifest, null, 2), { flag: "wx" });
    const deleted = await client.query(
      "delete from gym.private_files f where f.id=any($1::uuid[]) and not exists(select 1 from gym.expenses e where e.organization_id=f.organization_id and e.file_id=f.id) returning id",
      [candidates.map((row) => row.id)],
    );
    await client.query("commit");
    console.log(
      JSON.stringify({
        mode: "apply",
        deleted: deleted.rowCount,
        manifest: path,
      }),
    );
  }
} catch (error) {
  await client.query("rollback");
  console.error("Staged receipt maintenance stopped", {
    code: error.code ?? "VERIFICATION_ERROR",
  });
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
