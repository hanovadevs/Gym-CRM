import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { configureAuth } from "../../src/server/auth/configure";
import { createSecurity } from "../../src/server/security/service";
import { createMembersService } from "../../src/modules/members/service";
import { createPlansService } from "../../src/modules/plans/service";
import { createMembershipsService } from "../../src/modules/memberships/service";
import { createBillingService } from "../../src/modules/billing/service";
import { createSettingsService } from "../../src/modules/settings/service";
import { invoicePdf } from "../../src/modules/billing/pdf";
import { todayInZone, endOn } from "../../src/modules/plans/format";
import { securityFixture } from "../helpers/security-fixture";
config({ path: ".env.local", quiet: true });
for (const k of ["TEST_DATABASE_URL", "TEST_MIGRATION_DATABASE_URL"])
  if (new URL(process.env[k]!).pathname !== "/gym_test")
    throw new Error("Isolated gym_test required");
const admin = new pg.Client({
    connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
  }),
  pool = new pg.Pool({
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
  }),
  security = createSecurity(pool, (h) => auth.api.getSession({ headers: h })),
  billing = createBillingService(security),
  members = createMembersService(security),
  plans = createPlansService(security),
  subs = createMembershipsService(security);
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
  const member = async (
    name: string,
    branch = f.a1,
    head = owner,
    organizationId = f.orgA,
  ) =>
    (
      await members.create(head, {
        organizationId,
        name,
        email: randomUUID() + "@example.invalid",
        phone: "",
        homeBranchId: branch,
        joinedOn: today,
        registrationKey: randomUUID(),
      })
    ).member;
  const sara = await member("Sara Ahmed"),
    north = await member("North Billing", f.a2),
    other = await member("Private B", f.b1, foreign, f.orgB);
  const values = {
    description: "Training services",
    currency: "PKR",
    dueOn: today,
    lines: [
      {
        description: "Personal training",
        quantity: 3,
        unitMinor: 125050,
        discountMinor: 5000,
      },
      {
        description: "Locker rental",
        quantity: 1,
        unitMinor: 100025,
        discountMinor: 25,
      },
    ],
  };
  const input = {
    ...org,
    memberId: sara.id,
    values,
    requestKey: randomUUID(),
    reason: "Agreed additional services",
  };
  const created = await billing.create(owner, input),
    draft = await billing.get(owner, created.invoiceId, org);
  assert.equal(draft.invoice.status, "draft");
  assert.equal(draft.invoice.number, null);
  assert.equal(draft.invoice.balanceMinor, "0");
  assert.equal(draft.invoice.totalMinor, "470150");
  assert.equal(draft.subtotalMinor, 475175);
  assert.equal(draft.discountMinor, 5025);
  assert.equal(
    (await billing.create(owner, input)).invoiceId,
    created.invoiceId,
  );
  await deny(
    () =>
      billing.create(owner, {
        ...input,
        values: { ...values, description: "Changed payload" },
      }),
    "CONFLICT",
  );
  await deny(() => billing.download(owner, created.invoiceId, org), "CONFLICT");
  const listed = await billing.list(owner, org);
  assert.equal(listed.summary.draftCount, 1);
  assert.equal(listed.summary.outstandingCount, 0);
  assert.equal(
    (
      await billing.list(owner, {
        ...org,
        sort: "amount",
        from: today,
        to: today,
      })
    ).total,
    1,
  );
  const edit = {
    ...org,
    operation: "edit",
    version: 1,
    requestKey: randomUUID(),
    reason: "Agreed corrected line",
    values: { ...values, description: "Training services corrected" },
  };
  const races = await Promise.allSettled([
    billing.change(owner, created.invoiceId, edit),
    billing.change(manager, created.invoiceId, {
      ...edit,
      requestKey: randomUUID(),
    }),
  ]);
  assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
  const updated = await billing.get(owner, created.invoiceId, org);
  assert.equal(updated.invoice.version, 2);
  assert.equal(updated.invoice.lineRevision, 2);
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.invoice_items where invoice_id=$1",
        [created.invoiceId],
      )
    ).rows[0].n,
    4,
  );
  await deny(
    () =>
      billing.change(owner, created.invoiceId, {
        ...edit,
        requestKey: randomUUID(),
      }),
    "CONFLICT",
  );
  await deny(
    () =>
      billing.create(owner, {
        ...input,
        requestKey: randomUUID(),
        values: {
          ...values,
          lines: [
            {
              description: "Excess discount",
              quantity: 1,
              unitMinor: 100,
              discountMinor: 101,
            },
          ],
        },
      }),
    "VALIDATION_ERROR",
  );
  const issue = {
    ...org,
    operation: "issue",
    version: 2,
    requestKey: randomUUID(),
    reason: "Reviewed charge approval",
  };
  const issuedRaces = await Promise.allSettled([
    billing.change(owner, created.invoiceId, issue),
    billing.change(reception, created.invoiceId, {
      ...issue,
      requestKey: randomUUID(),
    }),
  ]);
  assert.equal(issuedRaces.filter((r) => r.status === "fulfilled").length, 1);
  const issued = await billing.get(owner, created.invoiceId, org);
  assert.equal(issued.invoice.number, "GYM-INV-000001");
  assert.equal(issued.invoice.balanceMinor, "470150");
  assert.equal(issued.invoice.lineRevision, 2);
  assert.equal(issued.invoice.version, 3);
  const paidKey = issuedRaces[0].status === "fulfilled" ? issue : null;
  if (paidKey)
    assert.equal(
      (await billing.change(owner, created.invoiceId, paidKey)).invoiceId,
      created.invoiceId,
    );
  await deny(
    () =>
      billing.change(owner, created.invoiceId, {
        ...edit,
        version: 3,
        requestKey: randomUUID(),
      }),
    "CONFLICT",
  );
  const pdf = await invoicePdf(
    await billing.download(owner, created.invoiceId, org),
  );
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 15000);
  await mkdir(".local/billing-evidence", { recursive: true });
  await writeFile(".local/billing-evidence/invoice.pdf", pdf);
  const beforeIdentity = JSON.stringify({
    recipient: issued.invoice.recipientName,
    issuer: issued.issuer,
  });
  await admin.query(
    "update gym.members set name='Renamed after issue' where id=$1",
    [sara.id],
  );
  await admin.query(
    "update gym.organizations set name='Renamed gym after issue' where id=$1",
    [f.orgA],
  );
  const frozen = await billing.get(owner, created.invoiceId, org);
  assert.equal(
    JSON.stringify({
      recipient: frozen.invoice.recipientName,
      issuer: frozen.issuer,
    }),
    beforeIdentity,
  );
  await admin.query(
    "update gym.organizations set name='Scope Gym A' where id=$1",
    [f.orgA],
  );
  await admin.query("update gym.members set name='Sara Ahmed' where id=$1", [
    sara.id,
  ]);
  assert.equal(
    (await billing.list(owner, { ...org, status: "outstanding" })).total,
    1,
  );
  assert.equal(
    (await billing.list(owner, { ...org, status: "overdue" })).total,
    0,
  );
  assert.equal((await billing.list(owner, { ...org, q: "%_" })).total, 0);
  assert.equal(
    (await billing.list(owner, { ...org, q: "' or true --" })).total,
    0,
  );
  await deny(
    () => billing.list(owner, { ...org, from: today, to: "2000-01-01" }),
    "VALIDATION_ERROR",
  );
  const privateDraft = await billing.create(owner, {
    ...input,
    memberId: north.id,
    requestKey: randomUUID(),
  });
  await deny(
    () => billing.get(reception, privateDraft.invoiceId, org),
    "NOT_FOUND",
  );
  await deny(
    () => billing.list(reception, { ...org, branchId: f.a2 }),
    "NOT_FOUND",
  );
  await deny(
    () => billing.get(foreign, created.invoiceId, { organizationId: f.orgB }),
    "NOT_FOUND",
  );
  await deny(() => billing.get(foreign, created.invoiceId, org), "NOT_FOUND");
  await deny(
    () =>
      billing.create(reception, {
        ...input,
        memberId: north.id,
        requestKey: randomUUID(),
      }),
    "NOT_FOUND",
  );
  await deny(
    () =>
      billing.create(owner, {
        ...input,
        memberId: other.id,
        requestKey: randomUUID(),
      }),
    "NOT_FOUND",
  );
  await admin.query(
    "update gym.staff_memberships set role='accountant' where id=$1",
    [f.memberships.reception],
  );
  assert.equal(
    (await billing.get(reception, created.invoiceId, org)).canManageMembers,
    false,
  );
  const recipients = await billing.recipients(reception, { ...org, q: "Sara" });
  assert.equal(recipients.total, 1);
  assert.deepEqual(Object.keys(recipients.recipients[0]).sort(), [
    "branchId",
    "branchName",
    "id",
    "memberCode",
    "name",
  ]);
  await deny(() => members.list(reception, org), "FORBIDDEN");
  await admin.query(
    "update gym.staff_memberships set role='trainer' where id=$1",
    [f.memberships.reception],
  );
  await deny(() => billing.list(reception, org), "FORBIDDEN");
  await deny(
    () => billing.download(reception, created.invoiceId, org),
    "FORBIDDEN",
  );
  await admin.query(
    "update gym.staff_memberships set role='receptionist' where id=$1",
    [f.memberships.reception],
  );
  const balanceBefore = (await billing.list(owner, org)).summary.currencies[0]
    .outstandingMinor;
  const saved = await plans.create(owner, {
    ...org,
    branchId: f.a1,
    code: "BILLING-SUB",
    values: {
      name: "Monthly strength",
      amountMinor: 450000,
      currency: "PKR",
      durationUnit: "months",
      durationCount: 1,
      accessMode: "home_branch",
      gymFloor: true,
      classes: false,
      personalTraining: false,
    },
    requestKey: randomUUID(),
    reason: "Enrollment billing integration",
  });
  const sub = await subs.enroll(owner, sara.id, {
    ...org,
    mode: "enroll",
    memberVersion: 1,
    planVersionId: saved.versionId,
    requestKey: randomUUID(),
    reason: "Enrollment invoice integration",
  });
  const enrolled = await billing.get(owner, sub.invoiceId, org);
  assert.equal(enrolled.items.length, 1);
  assert.equal(enrolled.invoice.number, "GYM-INV-000002");
  assert.equal(enrolled.invoice.totalMinor, "450000");
  assert.equal(enrolled.membershipTerm?.startOn, today);
  assert.equal(
    BigInt(
      (await billing.list(owner, org)).summary.currencies[0].outstandingMinor,
    ),
    BigInt(balanceBefore) + 450000n,
  );
  // Explicit historical migration fixture: issue-day filtering and overdue debt.
  const historical = (
    await admin.query(
      `insert into gym.memberships(organization_id,member_id,home_branch_id,plan_version_id,snapshot,amount_minor,currency,start_on,original_end_on_exclusive,end_on_exclusive,lifecycle,activated_at,created_by) select organization_id,member_id,home_branch_id,plan_version_id,snapshot,amount_minor,currency,'2000-01-01','2000-02-01','2000-02-01','active',now(),created_by from gym.memberships where id=$1 returning id`,
      [enrolled.invoice.membershipId],
    )
  ).rows[0].id;
  await admin.query(
    `insert into gym.invoices(organization_id,membership_id,member_id,originating_branch_id,number,description,total_minor,currency,issued_on,due_on,created_by) values($1,$2,$3,$4,'HISTORICAL-INV-1','Historical charge',450000,'PKR','2000-01-01','2000-02-01',$5)`,
    [f.orgA, historical, sara.id, f.a1, f.users["Owner A"].id],
  );
  assert.equal(
    (await billing.list(owner, { ...org, status: "overdue" })).total,
    1,
  );
  assert.equal(
    (
      await billing.list(owner, {
        ...org,
        from: "2000-01-01",
        to: "2000-12-31",
      })
    ).total,
    1,
  );
  // Currency-separated history survives configuration changes; current issuance cannot mix currency.
  const oldCurrencyDraft = await billing.create(owner, {
    ...input,
    requestKey: randomUUID(),
  });
  await admin.query("update gym.organizations set currency='USD' where id=$1", [
    f.orgA,
  ]);
  await deny(
    () =>
      billing.change(owner, oldCurrencyDraft.invoiceId, {
        ...org,
        operation: "issue",
        version: 1,
        requestKey: randomUUID(),
        reason: "Stale currency approval",
      }),
    "CONFLICT",
  );
  const usd = await billing.create(owner, {
    ...input,
    requestKey: randomUUID(),
    values: { ...values, currency: "USD" },
  });
  await billing.change(owner, usd.invoiceId, {
    ...org,
    operation: "issue",
    version: 1,
    requestKey: randomUUID(),
    reason: "USD charge approved",
  });
  assert.deepEqual(
    (await billing.list(owner, org)).summary.currencies.map((c) => c.currency),
    ["PKR", "USD"],
  );
  await admin.query("update gym.organizations set currency='PKR' where id=$1", [
    f.orgA,
  ]);
  // Forced audit failure rolls back draft revisions, invoice number, requests and debt.
  const roll = await billing.create(owner, {
      ...input,
      requestKey: randomUUID(),
    }),
    counter = (
      await admin.query(
        "select value::text from gym.number_counters where organization_id=$1 and kind='invoice'",
        [f.orgA],
      )
    ).rows[0].value;
  await admin.query("revoke insert on gym.audit_events from gym_runtime");
  await assert.rejects(() =>
    billing.change(owner, roll.invoiceId, {
      ...org,
      operation: "issue",
      version: 1,
      requestKey: randomUUID(),
      reason: "Audit failure rollback",
    }),
  );
  await assert.rejects(() =>
    billing.create(owner, { ...input, requestKey: randomUUID() }),
  );
  await admin.query("grant insert on gym.audit_events to gym_runtime");
  assert.equal(
    (await billing.get(owner, roll.invoiceId, org)).invoice.status,
    "draft",
  );
  assert.equal(
    (
      await admin.query(
        "select value::text from gym.number_counters where organization_id=$1 and kind='invoice'",
        [f.orgA],
      )
    ).rows[0].value,
    counter,
  );
  // Restricted-role direct writes cannot mutate issued headers/items or incomplete totals.
  const db = await pool.connect();
  try {
    assert.equal(
      (await db.query("select * from gym.invoice_balances")).rowCount,
      0,
    );
    for (const [sql, args] of [
      [
        "update gym.invoices set total_minor=0,version=version+1 where id=$1",
        [created.invoiceId],
      ],
      [
        "update gym.invoice_items set description='tampered' where invoice_id=$1",
        [created.invoiceId],
      ],
      [
        "delete from gym.invoice_items where invoice_id=$1",
        [created.invoiceId],
      ],
      [
        "update gym.billing_requests set request_hash='tampered' where invoice_id=$1",
        [created.invoiceId],
      ],
      [
        "update gym.invoices set total_minor=1,version=version+1,line_revision=line_revision+1 where id=$1",
        [roll.invoiceId],
      ],
    ] as const) {
      await db.query("begin");
      await db.query("select set_config('app.organization_id',$1,true)", [
        f.orgA,
      ]);
      await assert.rejects(async () => {
        await db.query(sql, [...args]);
        await db.query("commit");
      });
      await db.query("rollback");
    }
    await db.query("begin");
    await db.query("select set_config('app.organization_id',$1,true)", [
      f.orgB,
    ]);
    assert.equal(
      (
        await db.query("select * from gym.invoice_items where invoice_id=$1", [
          created.invoiceId,
        ])
      ).rowCount,
      0,
    );
    await db.query("rollback");
  } finally {
    db.release();
  }
  // Archived members retain issued history/PDF but cannot receive a new charge.
  await admin.query("update gym.members set archived_at=now() where id=$1", [
    sara.id,
  ]);
  await deny(
    () => billing.create(owner, { ...input, requestKey: randomUUID() }),
    "CONFLICT",
  );
  await deny(
    () =>
      billing.change(owner, roll.invoiceId, {
        ...org,
        operation: "issue",
        version: 1,
        requestKey: randomUUID(),
        reason: "Archived member charge",
      }),
    "CONFLICT",
  );
  assert.equal(
    (await billing.get(owner, created.invoiceId, org)).invoice.number,
    "GYM-INV-000001",
  );
  await billing.download(owner, created.invoiceId, org);
  await admin.query("update gym.members set archived_at=null where id=$1", [
    sara.id,
  ]);
  // A no-charge invoice is not a receipt; past-due drafts require correction before issue.
  const free = await billing.create(owner, {
    ...input,
    requestKey: randomUUID(),
    values: {
      ...values,
      lines: [
        {
          description: "Included service",
          quantity: 1,
          unitMinor: 0,
          discountMinor: 0,
        },
      ],
    },
  });
  await billing.change(owner, free.invoiceId, {
    ...org,
    operation: "issue",
    version: 1,
    requestKey: randomUUID(),
    reason: "Included service approved",
  });
  assert.equal(
    (await billing.get(owner, free.invoiceId, org)).invoice.balanceMinor,
    "0",
  );
  const past = await billing.create(owner, {
    ...input,
    requestKey: randomUUID(),
    values: { ...values, dueOn: "2001-01-01" },
  });
  await deny(
    () =>
      billing.change(owner, past.invoiceId, {
        ...org,
        operation: "issue",
        version: 1,
        requestKey: randomUUID(),
        reason: "Past due approval",
      }),
    "VALIDATION_ERROR",
  );
  const moved = await member("Historical mover"),
    moveDraft = await billing.create(owner, {
      ...input,
      memberId: moved.id,
      requestKey: randomUUID(),
    }),
    moveIssued = await billing.create(owner, {
      ...input,
      memberId: moved.id,
      requestKey: randomUUID(),
    });
  await billing.change(owner, moveIssued.invoiceId, {
    ...org,
    operation: "issue",
    version: 1,
    requestKey: randomUUID(),
    reason: "Original branch service",
  });
  await admin.query("update gym.members set home_branch_id=$2 where id=$1", [
    moved.id,
    f.a2,
  ]);
  assert.equal(
    (await billing.get(reception, moveIssued.invoiceId, org)).invoice.branchId,
    f.a1,
  );
  assert.equal(
    (await billing.recipients(reception, { ...org, q: "Historical mover" }))
      .total,
    0,
  );
  await deny(
    () =>
      billing.change(owner, moveDraft.invoiceId, {
        ...org,
        operation: "issue",
        version: 1,
        requestKey: randomUUID(),
        reason: "Wrong original branch",
      }),
    "CONFLICT",
  );
  // The actual saved debt policy consumes the shared view: drafts are not debts.
  const settings = createSettingsService(security, async () => {
      throw new Error("No provisioning");
    }),
    policy = await settings.get(owner, org);
  await settings.save(owner, {
    ...org,
    version: policy.version,
    changes: { paidActivation: false, debtBlocksAccess: true },
    reason: "Verify billing debt consumer",
  });
  const freeMember = await member("Draft debt eligibility"),
    freePlan = await plans.create(owner, {
      ...org,
      branchId: f.a1,
      code: "BILLING-FREE",
      values: {
        name: "Included plan",
        amountMinor: 0,
        currency: "PKR",
        durationUnit: "days",
        durationCount: 30,
        accessMode: "home_branch",
        gymFloor: true,
        classes: false,
        personalTraining: false,
      },
      requestKey: randomUUID(),
      reason: "Included plan policy check",
    });
  await subs.enroll(owner, freeMember.id, {
    ...org,
    mode: "enroll",
    memberVersion: 1,
    planVersionId: freePlan.versionId,
    requestKey: randomUUID(),
    reason: "Included enrollment",
  });
  const debtDraft = await billing.create(owner, {
    ...input,
    memberId: freeMember.id,
    requestKey: randomUUID(),
  });
  assert.equal(
    (await subs.get(owner, freeMember.id, org)).eligibility.allowed,
    true,
  );
  await billing.change(owner, debtDraft.invoiceId, {
    ...org,
    operation: "issue",
    version: 1,
    requestKey: randomUUID(),
    reason: "Actual outstanding charge",
  });
  assert.equal(
    (await subs.get(owner, freeMember.id, org)).eligibility.reason,
    "debt_blocked",
  );
  const restorePolicy = await settings.get(owner, org);
  await settings.save(owner, {
    ...org,
    version: restorePolicy.version,
    changes: { paidActivation: true, debtBlocksAccess: false },
    reason: "Restore fixture policy",
  });
  // Paginated/filter-consistent lists and bounded recipient search.
  for (let n = 0; n < 26; n++)
    await billing.create(owner, {
      ...input,
      requestKey: randomUUID(),
      values: { ...values, description: "Paged draft " + n },
    });
  const first = await billing.list(owner, {
      ...org,
      q: "Paged draft",
      status: "draft",
    }),
    last = await billing.list(owner, {
      ...org,
      q: "Paged draft",
      status: "draft",
      page: 999,
    });
  assert.equal(first.total, 26);
  assert.equal(first.invoices.length, 25);
  assert.equal(last.page, 2);
  assert.equal(last.invoices.length, 1);
  assert.ok(!first.invoices.some((i) => i.id === last.invoices[0].id));
  // Long item text must paginate rather than clip; include real Arabic glyphs.
  const long = await billing.create(owner, {
    ...input,
    requestKey: randomUUID(),
    values: {
      ...values,
      description: "Detailed training invoice",
      dueOn: endOn(today, 7, "days"),
      lines: Array.from({ length: 30 }, (_, n) => ({
        description:
          n === 1
            ? "تربیت کی فیس"
            : (
                "Training session " +
                (n + 1) +
                " - " +
                "Reviewed coaching session with supervised exercise and equipment. ".repeat(
                  2,
                )
              ).slice(0, 150),
        quantity: 1,
        unitMinor: 10001,
        discountMinor: 1,
      })),
    },
  });
  await billing.change(owner, long.invoiceId, {
    ...org,
    operation: "issue",
    version: 1,
    requestKey: randomUUID(),
    reason: "Detailed statement approved",
  });
  await writeFile(
    ".local/billing-evidence/invoice-multipage.pdf",
    await invoicePdf(await billing.download(owner, long.invoiceId, org)),
  );
  await admin.query(
    "update gym.staff_memberships set active=false where id=$1",
    [f.memberships.reception],
  );
  await deny(() => billing.list(reception, org), "NOT_FOUND");
  console.log(
    "PASS: invoice drafts/immutable revisions/issue/snapshots, exact lines/balances/currency-separated filters/paging; real sessions, accounting minimum DTO/roles/branches/tenant/RLS; replay, concurrent issue/edit and audit/counter rollback; enrollment integration; archived/currency/date rules; authorized single/multi-page PDF generation. No real GYM fixtures or external sends.",
  );
} finally {
  await admin.query("grant insert on gym.audit_events to gym_runtime");
  await f.cleanup();
  await admin.end();
  await pool.end();
}
