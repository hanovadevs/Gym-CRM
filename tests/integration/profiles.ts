import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureAuth } from "../../src/server/auth/configure";
import { createSecurity } from "../../src/server/security/service";
import { createMembersService } from "../../src/modules/members/service";
import { createProfileService } from "../../src/modules/members/profile-service";
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
const secret = process.env.BETTER_AUTH_SECRET!,
  baseURL = process.env.APP_URL!;
const f = await securityFixture(admin, secret, baseURL);
const auth = configureAuth(pool, {
    secret,
    baseURL,
    sendReset: async () => {},
  }),
  security = createSecurity(pool, (h) => auth.api.getSession({ headers: h })),
  members = createMembersService(security),
  profiles = createProfileService(security),
  headers: Record<string, Headers> = {};
const deny = (fn: () => Promise<unknown>, code: string) =>
  assert.rejects(
    fn,
    (e: unknown) => e instanceof Error && "code" in e && e.code === code,
  );
try {
  for (const [name, u] of Object.entries(f.users)) {
    const r = await auth.api.signInEmail({
      body: { email: u.email, password: u.password },
      asResponse: true,
    });
    headers[name] = new Headers({
      cookie: r.headers
        .getSetCookie()
        .map((s) => s.split(";")[0])
        .join(";"),
    });
  }
  const owner = headers["Owner A"],
    reception = headers["Reception A"],
    manager = headers["Shared Staff"],
    org = { organizationId: f.orgA };
  const create = (branch = f.a1, organizationId = f.orgA, h = owner) =>
    members.create(h, {
      organizationId,
      name: "Profile Member",
      phone: "",
      email: randomUUID() + "@example.invalid",
      homeBranchId: branch,
      joinedOn: "2026-01-01",
      registrationKey: randomUUID(),
    });
  const m = (await create()).member,
    north = (await create(f.a2)).member,
    b = (await create(f.b1, f.orgB, headers["Owner B"])).member;
  await deny(() => profiles.get(new Headers(), m.id, org), "UNAUTHENTICATED");
  await deny(() => profiles.get(owner, b.id, org), "NOT_FOUND");
  await deny(() => profiles.get(reception, north.id, org), "NOT_FOUND");
  let profile = await profiles.get(owner, m.id, org);
  assert.equal(profile.member.memberCode, m.memberCode);
  assert.equal(profile.contact, null);
  assert.equal(profile.eligibility.reason, "no_membership");
  const contact = {
    name: "Family Contact",
    phone: "03009876543",
    relationship: "Sibling",
  };
  await profiles.contact(reception, {
    ...org,
    id: m.id,
    version: m.version,
    reason: "Record emergency contact",
    contact,
  });
  profile = await profiles.get(owner, m.id, org);
  assert.deepEqual(profile.contact, contact);
  assert.equal(profile.member.version, 2);
  await deny(
    () =>
      profiles.contact(reception, {
        ...org,
        id: m.id,
        version: 1,
        reason: "Stale overwrite",
        contact: null,
      }),
    "CONFLICT",
  );
  await deny(
    () =>
      profiles.contact(reception, {
        ...org,
        id: north.id,
        version: 1,
        reason: "Wrong branch",
        contact,
      }),
    "NOT_FOUND",
  );
  const note = {
    ...org,
    id: m.id,
    body: "Prefers evening appointments",
    visibility: "operational",
    requestKey: randomUUID(),
  };
  const saved = await profiles.note(reception, note);
  const retry = await profiles.note(reception, note);
  assert.equal(saved.id, retry.id);
  await deny(
    () => profiles.note(reception, { ...note, body: "Changed retry" }),
    "CONFLICT",
  );
  const privateNote = await profiles.note(owner, {
    ...note,
    body: "Management-only operational review",
    visibility: "management",
    requestKey: randomUUID(),
  });
  await deny(
    () =>
      profiles.note(reception, {
        ...note,
        requestKey: randomUUID(),
        visibility: "management",
      }),
    "FORBIDDEN",
  );
  let visible = await profiles.get(reception, m.id, org);
  assert.equal(visible.notesTotal, 1);
  assert.ok(!JSON.stringify(visible).includes("Management-only"));
  assert.ok(!visible.notes.some((n) => n.id === privateNote.id));
  assert.equal((await profiles.get(manager, m.id, org)).notesTotal, 2);
  await deny(
    () =>
      profiles.withdraw(reception, {
        ...org,
        id: m.id,
        noteId: privateNote.id,
        reason: "Attempt private note access",
      }),
    "NOT_FOUND",
  );
  const another = await profiles.note(owner, {
    ...note,
    requestKey: randomUUID(),
    body: "Owner operational note",
  });
  await deny(
    () =>
      profiles.withdraw(reception, {
        ...org,
        id: m.id,
        noteId: another.id,
        reason: "Not my note",
      }),
    "FORBIDDEN",
  );
  await profiles.withdraw(reception, {
    ...org,
    id: m.id,
    noteId: saved.id,
    reason: "Replaced by a corrected note",
  });
  await profiles.withdraw(reception, {
    ...org,
    id: m.id,
    noteId: saved.id,
    reason: "Repeat safe request",
  });
  visible = await profiles.get(reception, m.id, org);
  assert.equal(visible.notes.find((n) => n.id === saved.id)!.body, null);
  assert.equal(visible.notes.find((n) => n.id === saved.id)!.withdrawn, true);
  assert.equal(
    (
      await admin.query("select body from gym.member_notes where id=$1", [
        saved.id,
      ])
    ).rows[0].body,
    note.body,
  );
  const keys = Array.from({ length: 22 }, () => randomUUID());
  await Promise.all(
    keys.map((key, i) =>
      profiles.note(owner, {
        ...note,
        requestKey: key,
        body: "Paginated note " + i,
      }),
    ),
  );
  profile = await profiles.get(owner, m.id, org);
  assert.equal(profile.notes.length, 20);
  const page2 = await profiles.get(owner, m.id, { ...org, notesPage: 2 });
  assert.ok(page2.notes.length > 0);
  assert.ok(
    page2.notes.every((n) => !profile.notes.some((p) => p.id === n.id)),
  );
  await admin.query("revoke insert on gym.audit_events from gym_runtime");
  try {
    await assert.rejects(
      () =>
        profiles.contact(owner, {
          ...org,
          id: m.id,
          version: 2,
          reason: "Forced audit rollback",
          contact: { ...contact, name: "Must not persist" },
        }),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        profiles.archive(owner, {
          ...org,
          id: m.id,
          version: 2,
          reason: "Forced archive rollback",
          archived: true,
        }),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        profiles.note(owner, {
          ...note,
          requestKey: randomUUID(),
          body: "Must roll back note",
        }),
      /permission denied/,
    );
  } finally {
    await admin.query("grant insert on gym.audit_events to gym_runtime");
  }
  profile = await profiles.get(owner, m.id, org);
  assert.equal(profile.member.version, 2);
  assert.equal(profile.contact!.name, contact.name);
  assert.ok(!profile.notes.some((n) => n.body === "Must roll back note"));
  await deny(
    () =>
      profiles.archive(reception, {
        ...org,
        id: m.id,
        version: 2,
        archived: true,
        reason: "Unauthorized archive",
      }),
    "FORBIDDEN",
  );
  const archiveResult = await profiles.archive(manager, {
    ...org,
    id: m.id,
    version: 2,
    archived: true,
    reason: "Member requested archive",
  });
  profile = await profiles.get(owner, m.id, org);
  assert.ok(profile.member.archivedAt);
  assert.equal(profile.eligibility.reason, "archived");
  assert.equal(profile.eligibility.allowed, false);
  assert.equal(profile.contact!.name, contact.name);
  assert.ok(profile.notesTotal > 20);
  assert.ok(
    !(await members.list(owner, org)).members.some((x) => x.id === m.id),
  );
  assert.equal(
    (await members.list(owner, { ...org, status: "archived" })).members[0].id,
    m.id,
  );
  await deny(
    () => profiles.note(reception, { ...note, requestKey: randomUUID() }),
    "NOT_FOUND",
  );
  await deny(
    () =>
      profiles.contact(owner, {
        ...org,
        id: m.id,
        version: 3,
        reason: "Archived edit",
        contact: null,
      }),
    "NOT_FOUND",
  );
  await deny(
    () =>
      members.update(owner, {
        ...org,
        id: m.id,
        version: 3,
        name: m.name,
        phone: m.phone,
        email: m.email,
        homeBranchId: m.homeBranchId,
        joinedOn: m.joinedOn,
        reason: "Archived edit",
      }),
    "NOT_FOUND",
  );
  const event = (
    await admin.query(
      "select action from gym.audit_events where request_id=$1",
      [archiveResult.requestId],
    )
  ).rows[0];
  assert.equal(event.action, "member.archived");
  await profiles.archive(owner, {
    ...org,
    id: m.id,
    version: 3,
    archived: false,
    reason: "Approved return",
  });
  profile = await profiles.get(owner, m.id, org);
  assert.equal(profile.member.archivedAt, null);
  assert.equal(profile.eligibility.reason, "no_membership");
  await profiles.contact(owner, {
    ...org,
    id: m.id,
    version: 4,
    reason: "Remove outdated emergency contact",
    contact: null,
  });
  assert.equal((await profiles.get(owner, m.id, org)).contact, null);
  const race = await Promise.allSettled([
    profiles.archive(owner, {
      ...org,
      id: m.id,
      version: 5,
      archived: true,
      reason: "Concurrent archive",
    }),
    profiles.contact(reception, {
      ...org,
      id: m.id,
      version: 5,
      reason: "Concurrent contact correction",
      contact,
    }),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  const runtime = await pool.connect();
  try {
    assert.equal(
      (await runtime.query("select count(*)::int n from gym.member_notes"))
        .rows[0].n,
      0,
    );
    await assert.rejects(
      () => runtime.query("delete from gym.member_notes"),
      (e: { code: string }) => e.code === "42501",
    );
    await assert.rejects(
      () => runtime.query("update gym.member_notes set body='changed'"),
      (e: { code: string }) => e.code === "42501",
    );
  } finally {
    runtime.release();
  }
  const audit = JSON.stringify(
    (
      await admin.query(
        'select "before","after" from gym.audit_events where organization_id=$1',
        [f.orgA],
      )
    ).rows,
  );
  assert.ok(!audit.includes(contact.phone) && !audit.includes(note.body));
  await admin.query(
    "update gym.staff_memberships set role='trainer' where id=$1",
    [f.memberships.reception],
  );
  await deny(() => profiles.get(reception, m.id, org), "FORBIDDEN");
  console.log(
    "PASS: persisted profiles/emergency contacts; scoped and paginated management/operational notes; note replay/withdrawal retention; archive/restore/access denial with history preserved; direct role/tenant/branch/RLS denials; stale/contact-archive race and atomic audit rollback.",
  );
} finally {
  await f.cleanup();
  await admin.end();
  await pool.end();
}
