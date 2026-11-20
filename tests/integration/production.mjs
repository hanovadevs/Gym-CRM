import { config } from "dotenv";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
const url = "http://127.0.0.1:3200/dashboard";
let occupied = false;
try {
  await fetch(url);
  occupied = true;
} catch {}
if (occupied)
  throw new Error(
    "Production test port 3200 is occupied; refusing to reuse it",
  );
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3200",
  ],
  {
    env: { ...process.env, NODE_ENV: "production", DEMO_MODE: "false" },
    stdio: "ignore",
  },
);
try {
  let response;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("Production server exited");
    try {
      response = await fetch(url);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  assert.ok(response, "Production server must start");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes("dashboard preview is disabled"));
  assert.ok(!html.includes("Good afternoon, Ali"));
  assert.ok(!html.includes("Demo data"));
  const denied = await fetch("http://127.0.0.1:3200/api/workspace");
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get("cache-control"), "no-store");
  assert.equal((await denied.json()).error.code, "UNAUTHENTICATED");
  const org = "00000000-0000-4000-8000-000000000001";
  for (const [path, method, body] of [
    ["/api/settings", "GET"],
    [
      "/api/settings",
      "PATCH",
      {
        organizationId: org,
        version: 1,
        changes: { phone: "0300-0000000" },
        reason: "Anonymous denial check",
      },
    ],
    [
      "/api/staff",
      "PATCH",
      {
        organizationId: org,
        id: org,
        version: 1,
        role: "owner",
        active: true,
        branchIds: [],
        reason: "Anonymous denial check",
      },
    ],
    [
      "/api/branches",
      "POST",
      {
        organizationId: org,
        name: "Blocked branch",
        code: "BLOCKED",
        active: true,
        reason: "Anonymous denial check",
      },
    ],
  ]) {
    const result = await fetch("http://127.0.0.1:3200" + path, {
      method,
      headers: {
        Origin: new URL(process.env.APP_URL).origin,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.equal(result.status, 401, path + " requires authentication");
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal((await result.json()).error.code, "UNAUTHENTICATED");
  }
  const protectedPage = await fetch("http://127.0.0.1:3200/workspace");
  // Next inserts a meta redirect when the loading boundary has already streamed.
  assert.ok(
    protectedPage.url.endsWith("/sign-in") ||
      (await protectedPage.text()).includes("url=/sign-in"),
  );
  const files = await readdir(".next/static", {
    recursive: true,
    withFileTypes: true,
  });
  let count = 0;
  const sensitive = [
    process.env.DATABASE_URL,
    process.env.MIGRATION_DATABASE_URL,
    process.env.BETTER_AUTH_SECRET,
  ].filter(Boolean);
  for (const file of files) {
    if (!file.isFile()) continue;
    const bytes = await readFile(file.parentPath + "/" + file.name);
    count++;
    for (const secret of sensitive)
      assert.ok(
        !bytes.includes(Buffer.from(secret)),
        "Server secret appeared in client asset",
      );
  }
  console.log(
    `PASS: production preview disabled; workspace/settings/staff/branch APIs 401/no-store and page sign-in redirect; ${count} client assets contain no configured database URLs/auth secret.`,
  );
} finally {
  server.kill();
}
