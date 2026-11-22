import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { configureAuth } from "../../src/server/auth/configure";
import { createSecurity } from "../../src/server/security/service";
import { createExpensesService } from "../../src/modules/expenses/service";
import { createFilesService } from "../../src/modules/files/service";
import { postgresPrivateStorage } from "../../src/modules/files/storage";
import { todayInZone } from "../../src/modules/plans/format";
import { securityFixture } from "../helpers/security-fixture";
config({ path: ".env.local", quiet: true });
for (const key of ["TEST_DATABASE_URL", "TEST_MIGRATION_DATABASE_URL"])
  if (new URL(process.env[key]!).pathname !== "/gym_test")
    throw Error("Only isolated gym_test allowed");
const admin = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 4,
});
await admin.connect();
const baseURL = "http://127.0.0.1:3100",
  f = await securityFixture(admin, process.env.BETTER_AUTH_SECRET!, baseURL);
const auth = configureAuth(pool, {
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL,
  sendReset: async () => {
    throw Error("No mail in expense tests");
  },
});
const security = createSecurity(pool, (h) =>
    auth.api.getSession({ headers: h }),
  ),
  expenses = createExpensesService(security),
  files = createFilesService(security);
const deny = (fn: () => Promise<unknown>, code: string) =>
  assert.rejects(
    fn,
    (e: unknown) => e instanceof Error && "code" in e && e.code === code,
  );
try {
  const sessions: Record<string, Headers> = {};
  for (const [name, u] of Object.entries(f.users)) {
    const r = await auth.api.signInEmail({
      body: { email: u.email, password: u.password },
      asResponse: true,
    });
    assert.equal(r.status, 200);
    sessions[name] = new Headers({
      cookie: r.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join(";"),
    });
  }
  const owner = sessions["Owner A"],
    manager = sessions["Shared Staff"],
    reception = sessions["Reception A"],
    foreign = sessions["Owner B"],
    org = { organizationId: f.orgA },
    today = todayInZone("Asia/Karachi");
  await deny(() => expenses.get(new Headers(), org), "UNAUTHENTICATED");
  await deny(() => expenses.get(reception, org), "FORBIDDEN");
  await deny(() => expenses.get(foreign, org), "NOT_FOUND");
  const categoryId = randomUUID(),
    category = {
      ...org,
      id: categoryId,
      operation: "create",
      name: "Operations",
      reason: "Set up expense acceptance category",
    };
  const cats = await Promise.all([
    expenses.category(owner, category),
    expenses.category(owner, category),
  ]);
  assert.equal(cats[0].categoryId, cats[1].categoryId);
  assert.equal((await expenses.get(owner, org)).categories.length, 1);
  await deny(
    () =>
      expenses.category(manager, {
        ...category,
        id: randomUUID(),
        name: "operations",
      }),
    "CONFLICT",
  );
  const image = await sharp({
    create: { width: 160, height: 90, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const upload = {
    ...org,
    branchId: f.a1,
    requestKey: randomUUID(),
    filename: "../Receipt.png",
    contentType: "image/png",
  };
  await deny(() => files.upload(reception, upload, image), "FORBIDDEN");
  await deny(
    () => files.upload(manager, { ...upload, branchId: f.a2 }, image),
    "NOT_FOUND",
  );
  await deny(
    () =>
      files.upload(
        owner,
        { ...upload, requestKey: randomUUID() },
        Buffer.from("<svg/>"),
      ),
    "VALIDATION_ERROR",
  );
  await deny(
    () =>
      files.upload(
        owner,
        { ...upload, requestKey: randomUUID(), contentType: "image/jpeg" },
        image,
      ),
    "VALIDATION_ERROR",
  );
  await deny(
    () =>
      files.upload(
        owner,
        { ...upload, requestKey: randomUUID() },
        Buffer.alloc(2097153),
      ),
    "VALIDATION_ERROR",
  );
  const uploaded = await files.upload(owner, upload, image);
  assert.ok(!uploaded.filename.includes("/"));
  assert.equal((await files.upload(owner, upload, image)).id, uploaded.id);
  await deny(
    () => files.upload(owner, { ...upload, filename: "Changed.png" }, image),
    "CONFLICT",
  );
  await deny(() => files.download(owner, uploaded.id, org), "NOT_FOUND");
  const body = {
    ...org,
    branchId: f.a1,
    categoryId,
    requestKey: randomUUID(),
    description: "Equipment service",
    payee: "Service vendor",
    amountMinor: "10000",
    currency: "PKR",
    paidOn: today,
    method: "cash",
    reference: "",
    fileId: uploaded.id,
  };
  await deny(() => expenses.post(reception, body), "FORBIDDEN");
  await deny(() => expenses.post(manager, body), "NOT_FOUND"); // another actor's staged receipt
  const [posted, replayed] = await Promise.all([
    expenses.post(owner, body),
    expenses.post(owner, body),
  ]);
  assert.equal(posted.expenseId, replayed.expenseId);
  await deny(
    () => expenses.post(owner, { ...body, amountMinor: "10001" }),
    "CONFLICT",
  );
  const downloaded = await files.download(manager, uploaded.id, org);
  assert.equal((await sharp(downloaded.file.content).metadata()).format, "png");
  await deny(() => files.download(reception, uploaded.id, org), "FORBIDDEN");
  await deny(() => files.download(foreign, uploaded.id, org), "NOT_FOUND");
  const existing = await expenses.get(owner, org);
  assert.deepEqual(existing.summary, [
    {
      currency: "PKR",
      postedMinor: "10000",
      reversedMinor: "0",
      netMinor: "10000",
    },
  ]);
  assert.equal(existing.rows[0].categoryName, "Operations");
  await expenses.category(owner, {
    ...org,
    operation: "update",
    id: categoryId,
    name: "Facilities",
    active: true,
    version: 1,
    reason: "Category renamed prospectively",
  });
  await deny(
    () =>
      expenses.category(owner, {
        ...org,
        operation: "update",
        id: categoryId,
        name: "Stale name",
        active: true,
        version: 1,
        reason: "Cannot overwrite category",
      }),
    "CONFLICT",
  );
  assert.equal(
    (await expenses.get(owner, org)).rows[0].categoryName,
    "Operations",
  );
  await deny(
    () =>
      expenses.post(owner, {
        ...body,
        requestKey: randomUUID(),
        replacesExpenseId: posted.expenseId,
        fileId: undefined,
      }),
    "CONFLICT",
  );
  const reverse = {
    ...org,
    expenseId: posted.expenseId,
    requestKey: randomUUID(),
    cashOn: today,
    reason: "Correct the recorded service amount",
  };
  const [reversed, reversedAgain] = await Promise.all([
    expenses.reverse(owner, reverse),
    expenses.reverse(owner, reverse),
  ]);
  assert.equal(reversed.reversalId, reversedAgain.reversalId);
  await deny(
    () => expenses.reverse(owner, { ...reverse, requestKey: randomUUID() }),
    "CONFLICT",
  );
  assert.deepEqual((await expenses.get(owner, org)).summary, [
    {
      currency: "PKR",
      postedMinor: "10000",
      reversedMinor: "10000",
      netMinor: "0",
    },
  ]);
  const replacement = await expenses.post(owner, {
    ...body,
    requestKey: randomUUID(),
    amountMinor: "12000",
    fileId: undefined,
    replacesExpenseId: posted.expenseId,
  });
  await deny(
    () =>
      expenses.post(owner, {
        ...body,
        requestKey: randomUUID(),
        amountMinor: "13000",
        fileId: undefined,
        replacesExpenseId: posted.expenseId,
      }),
    "CONFLICT",
  );
  let ledger = await expenses.get(owner, org);
  assert.equal(ledger.total, 3);
  assert.deepEqual(ledger.summary, [
    {
      currency: "PKR",
      postedMinor: "22000",
      reversedMinor: "10000",
      netMinor: "12000",
    },
  ]);
  assert.equal(
    ledger.rows.find(
      (e) => e.expenseId === posted.expenseId && e.kind === "expense",
    )!.replacementId,
    replacement.expenseId,
  );
  assert.equal(
    ledger.rows.find((e) => e.expenseId === replacement.expenseId)!
      .categoryName,
    "Facilities",
  );
  assert.equal(
    (await files.download(owner, uploaded.id, org)).file.id,
    uploaded.id,
  );
  const historical = await expenses.post(owner, {
    ...body,
    requestKey: randomUUID(),
    description: "Historical service",
    fileId: undefined,
    amountMinor: "1000",
    paidOn: "2000-01-01",
  });
  await expenses.reverse(owner, {
    ...org,
    expenseId: historical.expenseId,
    requestKey: randomUUID(),
    cashOn: today,
    reason: "Reverse old cash in current period",
  });
  ledger = await expenses.get(owner, org);
  assert.equal(ledger.summary[0].netMinor, "11000");
  const old = await expenses.get(owner, {
    ...org,
    from: "2000-01-01",
    to: "2000-01-31",
  });
  assert.equal(old.summary[0].netMinor, "1000");
  assert.equal(old.total, 1);
  assert.equal(
    (await expenses.get(owner, { ...org, branchId: f.a2 })).total,
    0,
  );
  assert.equal((await expenses.get(owner, { ...org, q: "%" })).total, 0);
  await deny(
    () => expenses.get(owner, { ...org, from: "2000-01-01", to: today }),
    "VALIDATION_ERROR",
  );
  await deny(
    () =>
      expenses.post(owner, {
        ...body,
        requestKey: randomUUID(),
        amountMinor: "-1",
      }),
    "VALIDATION_ERROR",
  );
  await deny(
    () =>
      expenses.post(owner, {
        ...body,
        requestKey: randomUUID(),
        method: "bank_transfer",
        reference: "",
      }),
    "VALIDATION_ERROR",
  );
  await deny(
    () =>
      expenses.post(owner, {
        ...body,
        requestKey: randomUUID(),
        fileId: undefined,
        paidOn: "2099-01-01",
      }),
    "VALIDATION_ERROR",
  );
  const rollback = { ...body, requestKey: randomUUID(), fileId: undefined };
  const before = ledger.total;
  await admin.query("revoke insert on gym.audit_events from gym_runtime");
  await assert.rejects(expenses.post(owner, rollback));
  await admin.query("grant insert on gym.audit_events to gym_runtime");
  assert.equal((await expenses.get(owner, org)).total, before);
  const rawOriginal = await expenses.post(owner, rollback);
  const broken = createFilesService(security, {
    ...postgresPrivateStorage,
    put: async () => {
      throw Error("Storage unavailable");
    },
  });
  const uploadRetry = { ...upload, requestKey: randomUUID() };
  const beforeFiles = (
    await admin.query(
      "select count(*)::int n from gym.private_files where organization_id=$1",
      [f.orgA],
    )
  ).rows[0].n;
  await assert.rejects(broken.upload(owner, uploadRetry, image));
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.private_files where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
    beforeFiles,
  );
  await files.upload(owner, uploadRetry, image);
  const jpeg = await sharp(image)
    .withMetadata({
      exif: { IFD0: { ImageDescription: "Private input metadata" } },
    })
    .jpeg()
    .toBuffer();
  const uploadedJpeg = await files.upload(
    owner,
    {
      ...upload,
      requestKey: randomUUID(),
      filename: "receipt.jpg",
      contentType: "image/jpeg",
    },
    jpeg,
  );
  await expenses.post(owner, {
    ...body,
    requestKey: randomUUID(),
    fileId: uploadedJpeg.id,
  });
  const jpegReceipt = await files.download(owner, uploadedJpeg.id, org);
  const jpegMetadata = await sharp(jpegReceipt.file.content).metadata();
  assert.equal(jpegMetadata.format, "jpeg");
  assert.equal(jpegMetadata.exif, undefined);
  const orphan = await files.upload(
    owner,
    { ...upload, requestKey: randomUUID() },
    image,
  );
  await admin.query(
    "update gym.private_files set uploaded_at=clock_timestamp()-interval '48 hours' where id=any($1::uuid[])",
    [[orphan.id, uploaded.id]],
  );
  const cleanupDry = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/clean-staged-receipts.mjs", "--test"],
      { encoding: "utf8" },
    ),
  );
  assert.equal(cleanupDry.mode, "dry-run");
  assert.equal(cleanupDry.candidates, 1);
  const cleanupResult = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/clean-staged-receipts.mjs", "--test", "--apply"],
      { encoding: "utf8" },
    ),
  );
  assert.equal(cleanupResult.deleted, 1);
  assert.equal(
    (await files.download(owner, uploaded.id, org)).file.id,
    uploaded.id,
  );
  const corruptStorage = createFilesService(security, {
    ...postgresPrivateStorage,
    get: async (db, orgId, fileId) => {
      const file = await postgresPrivateStorage.get(db, orgId, fileId);
      return file ? { ...file, content: Buffer.from("damaged") } : undefined;
    },
  });
  await deny(
    () => corruptStorage.download(owner, uploaded.id, org),
    "CONFLICT",
  );
  await admin.query(
    "update gym.staff_memberships set role='accountant' where id=$1",
    [f.memberships.reception],
  );
  assert.ok((await expenses.get(reception, org)).total > 0);
  await deny(
    () => expenses.get(reception, { ...org, branchId: f.a2 }),
    "NOT_FOUND",
  );
  await admin.query(
    "update gym.staff_memberships set role='trainer' where id=$1",
    [f.memberships.reception],
  );
  await deny(() => expenses.get(reception, org), "FORBIDDEN");
  async function runtime<T>(operation: (client: pg.PoolClient) => Promise<T>) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.organization_id',$1,true)", [
        f.orgA,
      ]);
      const value = await operation(client);
      await client.query("commit");
      return value;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  const rawReversal = (client: pg.PoolClient, amount: string, cashOn = today) =>
    client.query(
      "insert into gym.expense_reversals(organization_id,expense_id,branch_id,currency,amount_minor,cash_on,reason,actor_id,request_key,request_hash) values($1,$2,$3,'PKR',$4,$5,'Raw full reversal guard',$6,$7,$8) returning id",
      [
        f.orgA,
        rawOriginal.expenseId,
        f.a1,
        amount,
        cashOn,
        f.users["Owner A"].id,
        randomUUID(),
        "a".repeat(64),
      ],
    );
  await assert.rejects(
    runtime((client) => rawReversal(client, "10001")),
    { code: "23503" },
  );
  await assert.rejects(
    runtime((client) => rawReversal(client, "10000", "2099-01-01")),
    { code: "23514" },
  );
  const rawRace = await Promise.allSettled([
    runtime((client) => rawReversal(client, "10000")),
    runtime((client) => rawReversal(client, "10000")),
  ]);
  assert.equal(rawRace.filter((r) => r.status === "fulfilled").length, 1);
  const rawDuplicate = rawRace.find((r) => r.status === "rejected");
  assert.equal(
    rawDuplicate?.status === "rejected" && rawDuplicate.reason.code,
    "23505",
  );
  await assert.rejects(
    runtime((client) =>
      client.query(
        "update gym.private_files set filename='Changed' where id=$1",
        [uploaded.id],
      ),
    ),
    { code: "42501" },
  );
  await assert.rejects(
    runtime((client) =>
      client.query("delete from gym.expense_reversals where expense_id=$1", [
        rawOriginal.expenseId,
      ]),
    ),
    { code: "42501" },
  );
  await deny(
    () =>
      files.upload(
        owner,
        { ...upload, requestKey: randomUUID() },
        image.subarray(0, 30),
      ),
    "VALIDATION_ERROR",
  );
  const raw = await pool.connect();
  try {
    assert.equal(
      (await raw.query("select count(*)::int n from gym.private_files")).rows[0]
        .n,
      0,
    );
    for (const sql of [
      "update gym.expenses set amount_minor=1 where id=$1",
      "delete from gym.expenses where id=$1",
    ]) {
      await raw.query("begin");
      await raw.query("select set_config('app.organization_id',$1,true)", [
        f.orgA,
      ]);
      await assert.rejects(raw.query(sql, [posted.expenseId]), {
        code: "42501",
      });
      await raw.query("rollback");
    }
  } finally {
    await raw.query("rollback");
    raw.release();
  }
  console.log(
    "PASS expenses real sessions: category create replay/rename/history/stale/case uniqueness; private decoded PNG upload/replay/type/size/branch/actor/storage denial; immutable expense and full reversal/replacement/current-period net; historical reversal cash dates, role/tenant/branch denial, amount/date/bank validation, audit/storage rollback and runtime RLS/grants. No external mail.",
  );
} finally {
  await admin.query("grant insert on gym.audit_events to gym_runtime");
  await f.cleanup();
  await pool.end();
  await admin.end();
}
