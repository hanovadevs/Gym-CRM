import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { configureAuth } from "../../src/server/auth/configure";
import { createSecurity } from "../../src/server/security/service";
import { createMembersService } from "../../src/modules/members/service";
import { createProfileService } from "../../src/modules/members/profile-service";
import { createPlansService } from "../../src/modules/plans/service";
import { createMembershipsService } from "../../src/modules/memberships/service";
import { createBillingService } from "../../src/modules/billing/service";
import { createPaymentsService } from "../../src/modules/payments/service";
import { createSettingsService } from "../../src/modules/settings/service";
import { receiptPdf } from "../../src/modules/payments/receipt-pdf";
import { todayInZone, endOn } from "../../src/modules/plans/format";
import { securityFixture } from "../helpers/security-fixture";
config({ path: ".env.local", quiet: true });
for (const k of ["TEST_DATABASE_URL", "TEST_MIGRATION_DATABASE_URL"])
  if (new URL(process.env[k]!).pathname !== "/gym_test")
    throw Error("Isolated gym_test required");
const admin = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 4,
});
await admin.connect();
const f = await securityFixture(
  admin,
  process.env.BETTER_AUTH_SECRET!,
  process.env.APP_URL!,
);
const auth = configureAuth(pool, {
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.APP_URL!,
  sendReset: async () => {},
});
const security = createSecurity(pool, (h) =>
  auth.api.getSession({ headers: h }),
);
const members = createMembersService(security),
  profiles = createProfileService(security),
  plans = createPlansService(security),
  subs = createMembershipsService(security),
  billing = createBillingService(security),
  payments = createPaymentsService(security);
const deny = (fn: () => Promise<unknown>, code: string) =>
  assert.rejects(
    fn,
    (e: unknown) => e instanceof Error && "code" in e && e.code === code,
  );
try {
  const h: Record<string, Headers> = {};
  for (const [name, u] of Object.entries(f.users)) {
    const r = await auth.api.signInEmail({
      body: { email: u.email, password: u.password },
      asResponse: true,
    });
    h[name] = new Headers({
      cookie: r.headers
        .getSetCookie()
        .map((s) => s.split(";")[0])
        .join(";"),
    });
  }
  const owner = h["Owner A"],
    reception = h["Reception A"],
    manager = h["Shared Staff"],
    foreign = h["Owner B"],
    org = { organizationId: f.orgA },
    today = todayInZone("Asia/Karachi");
  const member = async (name: string, branch = f.a1) =>
    (
      await members.create(owner, {
        ...org,
        name,
        email: randomUUID() + "@example.invalid",
        phone: "",
        homeBranchId: branch,
        joinedOn: today,
        registrationKey: randomUUID(),
      })
    ).member;
  const plan = await plans.create(owner, {
    ...org,
    branchId: f.a1,
    code: "PAYMENT-PLAN",
    values: {
      name: "Monthly strength",
      amountMinor: 100000,
      currency: "PKR",
      durationCount: 1,
      durationUnit: "months",
      accessMode: "home_branch",
      gymFloor: true,
      classes: false,
      personalTraining: false,
    },
    requestKey: randomUUID(),
    reason: "Payment acceptance plan",
  });
  async function enroll(name: string, startOn = today) {
    const m = await member(name);
    const r = await subs.enroll(owner, m.id, {
      ...org,
      mode: "enroll",
      memberVersion: 1,
      planVersionId: plan.versionId,
      startOn,
      requestKey: randomUUID(),
      reason: "Reviewed payment enrollment",
    });
    const inv = (
      await admin.query("select id from gym.invoices where membership_id=$1", [
        r.membershipId,
      ])
    ).rows[0].id as string;
    return { memberId: m.id, membershipId: r.membershipId, invoiceId: inv };
  }
  async function invoice(name: string, amount = 100000, branch = f.a1) {
    const m = await member(name, branch);
    const r = await billing.create(owner, {
      ...org,
      memberId: m.id,
      values: {
        description: name,
        currency: "PKR",
        dueOn: today,
        lines: [
          {
            description: "Coaching",
            quantity: 1,
            unitMinor: amount,
            discountMinor: 0,
          },
        ],
      },
      requestKey: randomUUID(),
      reason: "Reviewed coaching fee",
    });
    await billing.change(owner, r.invoiceId, {
      ...org,
      operation: "issue",
      version: 1,
      requestKey: randomUUID(),
      reason: "Agreed charge",
    });
    return { memberId: m.id, invoiceId: r.invoiceId };
  }
  const input = (
    invoiceId: string,
    amountMinor = "100000",
    expectedBalanceMinor = "100000",
  ) => ({
    ...org,
    invoiceId,
    amountMinor,
    expectedBalanceMinor,
    currency: "PKR",
    method: "cash",
    paidOn: today,
    reference: "",
    note: "",
    requestKey: randomUUID(),
  });
  const a = await enroll("Payment Sara");
  const header = (
    await admin.query("select to_jsonb(i) j from gym.invoices i where id=$1", [
      a.invoiceId,
    ])
  ).rows[0].j;
  const partialInput = {
    ...input(a.invoiceId, "40000"),
    note: "First installment",
    reference: "CASH-PAID-40",
  };
  const partial = await payments.record(reception, partialInput);
  assert.equal(partial.balanceAfterMinor, "60000");
  assert.equal(partial.activationResult, "partial");
  assert.equal(
    (await subs.get(owner, a.memberId, org)).eligibility.reason,
    "pending_activation",
  );
  const complete = await payments.record(manager, {
    ...input(a.invoiceId, "60000", "60000"),
    method: "bank_transfer",
    reference: "BANK-2026-PAID",
  });
  assert.equal(complete.balanceAfterMinor, "0");
  assert.equal(complete.activationResult, "activated");
  assert.equal(
    (await subs.get(owner, a.memberId, org)).eligibility.allowed,
    true,
  );
  assert.deepEqual(
    (
      await admin.query(
        "select to_jsonb(i) j from gym.invoices i where id=$1",
        [a.invoiceId],
      )
    ).rows[0].j,
    header,
  );
  const oldReceipt = await payments.receipt(owner, partial.paymentId, org);
  assert.equal(oldReceipt.payment.balanceAfterMinor, "60000");
  assert.equal(oldReceipt.invoiceBalanceMinor, "0");
  assert.equal(
    (await payments.record(reception, partialInput)).paymentId,
    partial.paymentId,
  );
  await deny(
    () =>
      payments.record(reception, {
        ...partialInput,
        note: "Changed receipt note",
      }),
    "CONFLICT",
  );
  assert.equal((await profiles.get(owner, a.memberId, org)).payments.total, 2);
  assert.equal((await billing.get(owner, a.invoiceId, org)).payments.total, 2);
  const inv = await invoice("Validation invoice");
  for (const v of [
    { amountMinor: "0" },
    { amountMinor: "-1" },
    { amountMinor: "1.5" },
    { amountMinor: 1 },
    { method: "card" },
    { method: "bank_transfer", reference: "" },
    { paidOn: "2026-02-30" },
    { note: "Two\nlines" },
    { currency: "USD" },
    { paidOn: endOn(today, 1, "days") },
    { paidOn: "2000-01-01" },
  ])
    await deny(
      () => payments.record(owner, { ...input(inv.invoiceId), ...v }),
      "VALIDATION_ERROR",
    );
  await deny(
    () => payments.record(owner, input(inv.invoiceId, "100001")),
    "CONFLICT",
  );
  const shared = input(inv.invoiceId, "30000");
  const replays = await Promise.all([
    payments.record(owner, shared),
    payments.record(owner, shared),
  ]);
  assert.equal(replays[0].paymentId, replays[1].paymentId);
  const races = await Promise.allSettled([
    payments.record(owner, input(inv.invoiceId, "50000", "70000")),
    payments.record(manager, input(inv.invoiceId, "50000", "70000")),
  ]);
  assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await billing.get(owner, inv.invoiceId, org)).invoice.balanceMinor,
    "20000",
  );
  await deny(
    () => payments.record(owner, input(inv.invoiceId, "20000", "70000")),
    "CONFLICT",
  );
  // Denying either downstream write must roll back the receipt counter, payment, membership and request key.
  const rollback = await enroll("Atomic rollback");
  const before = async () =>
    (
      await admin.query(
        "select (select count(*) from gym.payments where organization_id=$1)::text payments,(select value from gym.number_counters where organization_id=$1 and kind='receipt')::text counter,(select version from gym.members where id=$2) version,(select lifecycle from gym.memberships where id=$3) lifecycle",
        [f.orgA, rollback.memberId, rollback.membershipId],
      )
    ).rows[0];
  const original = await before(),
    retry = input(rollback.invoiceId);
  for (const table of ["audit_events", "payment_allocations"]) {
    await admin.query(`revoke insert on gym.${table} from gym_runtime`);
    await assert.rejects(() => payments.record(owner, retry));
    await admin.query(`grant insert on gym.${table} to gym_runtime`);
    assert.deepEqual(await before(), original);
  }
  assert.equal(
    (await payments.record(owner, retry)).activationResult,
    "activated",
  );
  // Historical debt can be collected, but payment cannot restore an archived/cancelled/expired membership.
  for (const state of ["archived", "cancelled", "expired"] as const) {
    const x = await enroll("Debt " + state);
    if (state === "archived")
      await admin.query(
        "update gym.members set archived_at=now() where id=$1",
        [x.memberId],
      );
    if (state === "cancelled")
      await admin.query(
        "update gym.memberships set lifecycle='cancelled',cancelled_effective_on=$2 where id=$1",
        [x.membershipId, today],
      );
    if (state === "expired")
      await admin.query(
        "update gym.memberships set start_on='2000-01-01',original_end_on_exclusive='2000-02-01',end_on_exclusive='2000-02-01' where id=$1",
        [x.membershipId],
      );
    assert.equal(
      (await payments.record(owner, input(x.invoiceId))).activationResult,
      state,
    );
    assert.equal(
      (
        await admin.query(
          "select activated_at from gym.memberships where id=$1",
          [x.membershipId],
        )
      ).rows[0].activated_at,
      null,
    );
  }
  const future = await enroll("Future access", endOn(today, 5, "days"));
  assert.equal(
    (await payments.record(owner, input(future.invoiceId))).activationResult,
    "activated",
  );
  assert.equal(
    (await subs.get(owner, future.memberId, org)).eligibility.reason,
    "not_started",
  );
  const frozen = await enroll("Frozen payment access");
  for (const operation of ["activate", "freeze"]) {
    const c = await subs.get(owner, frozen.memberId, org);
    await subs.change(owner, frozen.memberId, {
      ...org,
      memberVersion: c.memberVersion,
      membershipId: frozen.membershipId,
      version: c.memberships[0].version,
      requestKey: randomUUID(),
      reason: "Reviewed payment freeze policy",
      operation,
      ...(operation === "freeze"
        ? { startOn: today, endOn: endOn(today, 3, "days") }
        : {}),
    });
  }
  assert.equal(
    (await payments.record(owner, input(frozen.invoiceId))).activationResult,
    "already_active",
  );
  assert.equal(
    (await subs.get(owner, frozen.memberId, org)).eligibility.reason,
    "frozen",
  );
  const settings = createSettingsService(security, async () => {
    throw Error("No provisioning");
  });
  const policy = await settings.get(owner, org);
  await settings.save(owner, {
    ...org,
    version: policy.version,
    changes: { debtBlocksAccess: true },
    reason: "Verify allocation debt policy",
  });
  const debtor = await enroll("Other outstanding debt");
  const extra = await billing.create(owner, {
    ...org,
    memberId: debtor.memberId,
    values: {
      description: "Additional approved charge",
      currency: "PKR",
      dueOn: today,
      lines: [
        {
          description: "Locker",
          quantity: 1,
          unitMinor: 100000,
          discountMinor: 0,
        },
      ],
    },
    requestKey: randomUUID(),
    reason: "Approved extra charge",
  });
  await billing.change(owner, extra.invoiceId, {
    ...org,
    operation: "issue",
    version: 1,
    requestKey: randomUUID(),
    reason: "Agreed locker fee",
  });
  await payments.record(owner, input(debtor.invoiceId));
  assert.equal(
    (await subs.get(owner, debtor.memberId, org)).eligibility.reason,
    "debt_blocked",
  );
  await payments.record(owner, input(extra.invoiceId));
  assert.equal(
    (await subs.get(owner, debtor.memberId, org)).eligibility.allowed,
    true,
  );
  const policyNow = await settings.get(owner, org);
  await settings.save(owner, {
    ...org,
    version: policyNow.version,
    changes: { debtBlocksAccess: false },
    reason: "Restore fixture debt policy",
  });
  const north = await invoice("North original branch", 100000, f.a2);
  // A home-branch move does not move the debt or its collection permission.
  await admin.query("update gym.members set home_branch_id=$2 where id=$1", [
    north.memberId,
    f.a1,
  ]);
  await deny(
    () => payments.record(reception, input(north.invoiceId)),
    "NOT_FOUND",
  );
  const northPayment = await payments.record(owner, input(north.invoiceId));
  const oldBrand = (await payments.receipt(owner, northPayment.paymentId, org))
    .snapshot.issuer.name;
  await admin.query(
    "update gym.organizations set name='Changed payment branding',currency='USD' where id=$1",
    [f.orgA],
  );
  assert.equal(
    (await payments.receipt(owner, northPayment.paymentId, org)).snapshot.issuer
      .name,
    oldBrand,
  );
  // Existing PKR debt remains payable after the current configuration changes.
  const historical = await payments.record(
    owner,
    input(inv.invoiceId, "1", "20000"),
  );
  assert.equal(historical.balanceAfterMinor, "19999");
  const usdInvoice = await billing.create(owner, {
    ...org,
    memberId: inv.memberId,
    values: {
      description: "USD training charge",
      currency: "USD",
      dueOn: today,
      lines: [
        {
          description: "Coaching",
          quantity: 1,
          unitMinor: 125,
          discountMinor: 0,
        },
      ],
    },
    requestKey: randomUUID(),
    reason: "Currency separation check",
  });
  await billing.change(owner, usdInvoice.invoiceId, {
    ...org,
    operation: "issue",
    version: 1,
    requestKey: randomUUID(),
    reason: "Reviewed USD charge",
  });
  await payments.record(owner, {
    ...input(usdInvoice.invoiceId, "125", "125"),
    currency: "USD",
  });
  const currencies = (await payments.list(owner, org)).summary;
  assert.equal(currencies.length, 2);
  assert.equal(
    currencies.find((c) => c.currency === "USD")!.amountMinor,
    "125",
  );
  await admin.query(
    "update gym.organizations set name=$2,currency='PKR' where id=$1",
    [f.orgA, oldBrand],
  );
  await deny(
    () => payments.receipt(reception, northPayment.paymentId, org),
    "NOT_FOUND",
  );
  await deny(
    () =>
      payments.receipt(foreign, partial.paymentId, { organizationId: f.orgB }),
    "NOT_FOUND",
  );
  await admin.query(
    "update gym.staff_memberships set role='trainer' where id=$1",
    [f.memberships.reception],
  );
  await deny(
    () => payments.record(reception, input(inv.invoiceId, "19999", "19999")),
    "FORBIDDEN",
  );
  await deny(() => payments.list(new Headers(), org), "UNAUTHENTICATED");
  await admin.query(
    "update gym.staff_memberships set role='accountant' where id=$1",
    [f.memberships.reception],
  );
  assert.equal(
    (
      await payments.record(reception, {
        ...input(inv.invoiceId, "19999", "19999"),
        method: "other",
      })
    ).balanceAfterMinor,
    "0",
  );
  assert.equal(
    (await payments.list(reception, org)).payments.some(
      (p) => p.id === partial.paymentId,
    ),
    true,
  );
  const db = await pool.connect();
  try {
    assert.equal((await db.query("select id from gym.payments")).rowCount, 0);
    await db.query("begin");
    await db.query("select set_config('app.organization_id',$1,true)", [
      f.orgA,
    ]);
    await assert.rejects(
      () =>
        db.query("update gym.payments set amount_minor=1 where id=$1", [
          partial.paymentId,
        ]),
      { code: "42501" },
    );
    await db.query("rollback");
    await db.query("begin");
    await db.query("select set_config('app.organization_id',$1,true)", [
      f.orgA,
    ]);
    await assert.rejects(
      () =>
        db.query("delete from gym.payment_allocations where payment_id=$1", [
          partial.paymentId,
        ]),
      { code: "42501" },
    );
    await db.query("rollback");
    const raw = await invoice("Raw constraints");
    await db.query("begin");
    await db.query("select set_config('app.organization_id',$1,true)", [
      f.orgA,
    ]);
    await db.query(
      "insert into gym.payments(organization_id,invoice_id,member_id,originating_branch_id,receipt_number,amount_minor,currency,method,paid_on,balance_after_minor,activation_result,receipt_snapshot,actor_id,request_key,request_hash) values($1,$2,$3,$4,$5,100,'PKR','cash',$6,0,'not_linked','{}',$7,$8,$9)",
      [
        f.orgA,
        raw.invoiceId,
        raw.memberId,
        f.a1,
        "RAW-" + randomUUID(),
        today,
        f.users["Owner A"].id,
        randomUUID(),
        "a".repeat(64),
      ],
    );
    await assert.rejects(() => db.query("commit"), { code: "23514" });
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from gym.payments where invoice_id=$1",
          [raw.invoiceId],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.query("rollback");
    db.release();
  }
  // Direct restricted-role writes independently enforce identity, allocation and
  // fresh balance caps even when the application service is bypassed.
  const rawInvoice = await invoice("Raw concurrent cap");
  async function rawWrite(amount: number, allocationAmount = amount) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.organization_id',$1,true)", [
        f.orgA,
      ]);
      const p = (
        await client.query(
          "insert into gym.payments(organization_id,invoice_id,member_id,originating_branch_id,receipt_number,amount_minor,currency,method,paid_on,balance_after_minor,activation_result,receipt_snapshot,actor_id,request_key,request_hash) values($1,$2,$3,$4,$5,$6,'PKR','cash',$7,0,'not_linked','{}',$8,$9,$10) returning id",
          [
            f.orgA,
            rawInvoice.invoiceId,
            rawInvoice.memberId,
            f.a1,
            "RAW-" + randomUUID(),
            amount,
            today,
            f.users["Owner A"].id,
            randomUUID(),
            "b".repeat(64),
          ],
        )
      ).rows[0];
      await client.query(
        "insert into gym.payment_allocations(organization_id,payment_id,invoice_id,member_id,originating_branch_id,currency,amount_minor) values($1,$2,$3,$4,$5,'PKR',$6)",
        [
          f.orgA,
          p.id,
          rawInvoice.invoiceId,
          rawInvoice.memberId,
          f.a1,
          allocationAmount,
        ],
      );
      await client.query("commit");
      return p.id;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }
  await assert.rejects(() => rawWrite(100, 99), { code: "23503" });
  const rawRace = await Promise.allSettled([rawWrite(70000), rawWrite(70000)]);
  assert.equal(rawRace.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await billing.get(owner, rawInvoice.invoiceId, org)).invoice.balanceMinor,
    "30000",
  );
  // Bounded, literal search and currency summaries use the same filtered rows, not the current page.
  const pageInvoice = await invoice("Paged receipts", 100000);
  for (let n = 0; n < 26; n++)
    await payments.record(owner, {
      ...input(pageInvoice.invoiceId, "100", String(100000 - n * 100)),
      reference: "PAGE-RECEIPT-" + n,
    });
  const first = await payments.list(owner, { ...org, q: "PAGE-RECEIPT-" }),
    last = await payments.list(owner, {
      ...org,
      q: "PAGE-RECEIPT-",
      page: 999,
    });
  assert.equal(first.total, 26);
  assert.equal(first.payments.length, 25);
  assert.equal(last.page, 2);
  assert.equal(last.payments.length, 1);
  assert.equal(first.summary[0].amountMinor, "2600");
  assert.equal((await payments.list(owner, { ...org, q: "%" })).total, 0);
  assert.equal(
    (
      await payments.list(owner, {
        ...org,
        method: "bank_transfer",
        from: today,
        to: today,
      })
    ).total,
    1,
  );
  const audit = (
    await admin.query(
      "select \"after\"::text data from gym.audit_events where action='payment.recorded' and entity_id=$1",
      [partial.paymentId],
    )
  ).rows[0];
  assert.ok(
    !audit.data.includes("First installment") &&
      !audit.data.includes("CASH-PAID-40"),
  );
  await mkdir(".local/payment-evidence", { recursive: true });
  await writeFile(
    ".local/payment-evidence/receipt-partial.pdf",
    await receiptPdf(await payments.download(owner, partial.paymentId, org)),
  );
  await writeFile(
    ".local/payment-evidence/receipt-paid.pdf",
    await receiptPdf(await payments.download(owner, complete.paymentId, org)),
  );
  const long = structuredClone(oldReceipt);
  long.snapshot.issuer.name = "Silver & Midnight Fitness and Wellness "
    .repeat(4)
    .slice(0, 120);
  long.snapshot.issuer.address = "Training and wellness centre, "
    .repeat(10)
    .slice(0, 250);
  long.snapshot.description = "Reviewed coaching and fitness services "
    .repeat(5)
    .slice(0, 160);
  long.payment.reference = "TRANSFER-" + "A".repeat(90);
  long.payment.note =
    "تربیت کی فیس " +
    "Received for reviewed coaching sessions. ".repeat(7).slice(0, 270);
  long.snapshot.issuer.footer = "Thank you for training with us. "
    .repeat(12)
    .slice(0, 300);
  await writeFile(
    ".local/payment-evidence/receipt-long.pdf",
    await receiptPdf(long),
  );
  const receiptPolicy = await settings.get(owner, org);
  await settings.save(owner, {
    ...org,
    version: receiptPolicy.version,
    changes: {
      receiptPrefix: "PAID",
      receiptFooter: "Custom saved receipt footer",
    },
    reason: "Verify saved receipt branding",
  });
  const branded = await payments.record(
    owner,
    input(pageInvoice.invoiceId, "100", "97400"),
  );
  assert.match(branded.receiptNumber, /^PAID-RC-\d{6}$/);
  assert.equal(
    (await payments.receipt(owner, branded.paymentId, org)).snapshot.issuer
      .footer,
    "Custom saved receipt footer",
  );
  assert.equal(
    (await payments.receipt(owner, partial.paymentId, org)).snapshot.issuer
      .footer,
    oldReceipt.snapshot.issuer.footer,
  );
  await admin.query(
    "update gym.staff_branch_grants set branch_id=$2 where staff_membership_id=$1",
    [f.memberships.reception, f.a2],
  );
  await deny(() => payments.record(reception, partialInput), "NOT_FOUND");
  await deny(
    () => payments.receipt(reception, partial.paymentId, org),
    "NOT_FOUND",
  );
  await admin.query(
    "update gym.staff_memberships set active=false where id=$1",
    [f.memberships.reception],
  );
  await deny(
    () => payments.receipt(reception, partial.paymentId, org),
    "NOT_FOUND",
  );
  console.log(
    "PASS PAY-02: real PostgreSQL partial/full settlement, pending/future/archived/cancelled/expired access, immutable receipts/invoices and profile history; same-key replay/concurrency/stale balances/overpayment; audit and allocation rollback; roles/branches/tenant/RLS/immutable runtime grants/deferred allocation; literal paging/filter summaries and private PDF generation. gym_test only; no sends.",
  );
} finally {
  await admin.query(
    "grant insert on gym.audit_events,gym.payment_allocations to gym_runtime",
  );
  await f.cleanup();
  await admin.end();
  await pool.end();
}
