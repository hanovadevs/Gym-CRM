import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureAuth } from "../../src/server/auth/configure";
import { createSecurity } from "../../src/server/security/service";
import { securityFixture } from "../helpers/security-fixture";
import { createClassesService } from "../../src/modules/classes/service";
import { createTrainingService } from "../../src/modules/training/service";
import { createMembersService } from "../../src/modules/members/service";
import { createPlansService } from "../../src/modules/plans/service";
import { createMembershipsService } from "../../src/modules/memberships/service";
import { todayInZone, endOn } from "../../src/modules/plans/format";
import { createPersonalTrainingService } from "../../src/modules/personal-training/service";
config({ path: ".env.local", quiet: true });
for (const key of ["TEST_DATABASE_URL", "TEST_MIGRATION_DATABASE_URL"])
  if (new URL(process.env[key]!).pathname !== "/gym_test")
    throw Error("Only gym_test");
const admin = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: "-c TimeZone=UTC",
  max: 4,
});
await admin.connect();
const baseURL = "http://127.0.0.1:3100",
  f = await securityFixture(admin, process.env.BETTER_AUTH_SECRET!, baseURL);
const auth = configureAuth(pool, {
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL,
  sendReset: async () => {
    throw Error("No email during payroll checks");
  },
});
const security = createSecurity(pool, (h) =>
  auth.api.getSession({ headers: h }),
);

async function login(name: string) {
  const u = f.users[name];
  const r = await auth.api.signInEmail({
    body: { email: u.email, password: u.password },
    asResponse: true,
  });
  assert.equal(r.status, 200);
  return new Headers({
    cookie: r.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join(";"),
  });
}
const classes = createClassesService(security),
  training = createTrainingService(security),
  members = createMembersService(security),
  plans = createPlansService(security),
  memberships = createMembershipsService(security);
const pt = createPersonalTrainingService(security);
const deny = (fn: () => Promise<unknown>, code: string) =>
  assert.rejects(
    fn,
    (e: unknown) => e instanceof Error && "code" in e && e.code === code,
  );
try {
  const headers = await login("Owner A"),
    desk = await login("Reception A"),
    manager = await login("Shared Staff"),
    today = todayInZone("Asia/Karachi"),
    date = endOn(today, 2, "days"),
    weekday = new Date(date + "T12:00:00Z").getUTCDay(),
    org = { organizationId: f.orgA },
    reason = "PT service acceptance",
    trainers = [randomUUID(), randomUUID()],
    rooms = [randomUUID(), randomUUID()];
  for (const [i, id] of trainers.entries()) {
    await training.saveTrainer(headers, {
      ...org,
      id,
      requestKey: randomUUID(),
      name: "PT coach " + i,
      branchIds: [f.a1],
      reason,
    });
    await classes.post(headers, {
      ...org,
      operation: "availability",
      id: randomUUID(),
      requestKey: randomUUID(),
      trainerId: id,
      branchId: f.a1,
      weekday,
      startMinute: 360,
      endMinute: 1320,
      active: true,
      reason,
    });
    await classes.post(headers, {
      ...org,
      operation: "room",
      id: rooms[i],
      requestKey: randomUUID(),
      branchId: f.a1,
      name: "PT room " + i,
      capacity: 5,
      active: true,
      reason,
    });
  }
  const values = {
    name: "PT access",
    amountMinor: 0,
    currency: "PKR",
    durationCount: 1,
    durationUnit: "months",
    accessMode: "home_branch",
    gymFloor: true,
    classes: true,
    personalTraining: true,
  };
  const plan = await plans.create(headers, {
    ...org,
    branchId: f.a1,
    code: "PT-ACCESS",
    values,
    requestKey: randomUUID(),
    reason,
  });
  const floor = await plans.create(headers, {
    ...org,
    branchId: f.a1,
    code: "PT-FLOOR",
    values: {
      ...values,
      name: "Floor only",
      classes: false,
      personalTraining: false,
    },
    requestKey: randomUUID(),
    reason,
  });
  const ids: string[] = [];
  for (const [i, name] of [
    "PT member one",
    "PT member two",
    "Floor-only member",
  ].entries()) {
    const m = (
      await members.create(headers, {
        ...org,
        name,
        email: randomUUID() + "@example.invalid",
        phone: "",
        homeBranchId: f.a1,
        joinedOn: today,
        registrationKey: randomUUID(),
      })
    ).member;
    ids.push(m.id);
    await memberships.enroll(headers, m.id, {
      ...org,
      mode: "enroll",
      memberVersion: m.version,
      planVersionId: i === 2 ? floor.versionId : plan.versionId,
      startOn: today,
      requestKey: randomUUID(),
      reason,
    });
  }
  const assignment = (trainerId: string, memberId: string) => ({
    ...org,
    operation: "assignment",
    id: randomUUID(),
    requestKey: randomUUID(),
    trainerId,
    branchId: f.a1,
    memberId,
    startOn: today,
    endOn: null,
    active: true,
    reason,
  });
  const a = assignment(trainers[0], ids[0]);
  await pt.post(headers, a);
  assert.equal((await pt.post(headers, a)).replayed, true);
  const a2 = assignment(trainers[0], ids[1]);
  await pt.post(headers, a2);
  const b = assignment(trainers[1], ids[0]);
  await pt.post(headers, b);
  const b2 = assignment(trainers[1], ids[1]);
  await pt.post(headers, b2);
  const noBenefit = assignment(trainers[0], ids[2]);
  await pt.post(headers, noBenefit);
  await deny(
    () => pt.post(headers, assignment(trainers[0], ids[0])),
    "CONFLICT",
  );
  await deny(() => pt.post(desk, assignment(trainers[0], ids[1])), "FORBIDDEN");
  const session = (
    assignmentId: string,
    start = "12:00",
    end = "13:00",
    roomId = rooms[0],
  ) => ({
    ...org,
    operation: "session",
    id: randomUUID(),
    requestKey: randomUUID(),
    assignmentId,
    roomId,
    title: "Initial coaching",
    startsAt: date + "T" + start + ":00+05:00",
    endsAt: date + "T" + end + ":00+05:00",
    reason,
  });
  const first = session(a.id);
  await pt.post(desk, first);
  assert.equal((await pt.post(desk, first)).replayed, true);
  const agenda = await pt.get(headers, {
    ...org,
    trainerId: trainers[0],
    from: date,
    to: date,
  });
  assert.equal(agenda.total, 1);
  assert.equal(agenda.assignments.length, 3);
  assert.equal(agenda.sessions[0].memberName, "PT member one");
  const byTitle = await pt.get(headers, {
    ...org,
    trainerId: trainers[0],
    from: date,
    to: date,
    q: "Initial coaching",
  });
  assert.equal(byTitle.assignments.length, 0);
  assert.equal(
    byTitle.sessionAssignments[0].id,
    a.id,
    "Editing remains possible when assignment is not on current filtered page",
  );
  await deny(
    () => pt.post(desk, session(noBenefit.id, "16:00", "17:00")),
    "CONFLICT",
  );
  await deny(() => pt.post(desk, session(b2.id, "12:30", "13:30")), "CONFLICT");
  await deny(
    () => pt.post(desk, session(b.id, "12:30", "13:30", rooms[1])),
    "CONFLICT",
  );
  const adjacent = session(a.id, "13:00", "14:00");
  await pt.post(desk, adjacent);
  const races = await Promise.allSettled([
    pt.post(desk, session(a2.id, "14:00", "15:00", rooms[1])),
    pt.post(manager, session(a2.id, "14:00", "15:00", rooms[1])),
  ]);
  assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
  await deny(
    () =>
      pt.post(headers, {
        ...a,
        version: 1,
        requestKey: randomUUID(),
        endOn: date,
      }),
    "CONFLICT",
  );
  const cancel = {
    ...org,
    operation: "cancel",
    id: first.id,
    version: 1,
    requestKey: randomUUID(),
    reason: "Cancel and retain original coaching history",
  };
  await pt.post(desk, cancel);
  assert.equal((await pt.post(desk, cancel)).replayed, true);
  await pt.post(desk, session(a.id));
  const moved = {
    ...adjacent,
    version: 1,
    requestKey: randomUUID(),
    startsAt: date + "T16:00:00+05:00",
    endsAt: date + "T17:00:00+05:00",
  };
  await pt.post(desk, moved);
  await deny(
    () => pt.post(desk, { ...moved, requestKey: randomUUID() }),
    "CONFLICT",
  );
  await deny(
    () =>
      pt.post(desk, {
        ...session(a.id, "18:00", "19:00"),
        startsAt: date + "T18:00:00+00:00",
      }),
    "VALIDATION_ERROR",
  );
  const foreign = await login("Owner B");
  await deny(() => pt.get(foreign, org), "NOT_FOUND");
  await admin.query(
    "update gym.staff_memberships set role='trainer',version=version+1 where organization_id=$1 and auth_user_id=$2",
    [f.orgA, f.users["Reception A"].id],
  );
  await training.saveTrainer(headers, {
    ...org,
    id: trainers[0],
    version: 1,
    requestKey: randomUUID(),
    name: "PT coach 0",
    branchIds: [f.a1],
    loginUserId: f.users["Reception A"].id,
    reason: "Link own trainer agenda",
  });
  const own = await pt.get(desk, {
    ...org,
    trainerId: trainers[0],
    from: date,
    to: date,
  });
  assert.equal(own.own, true);
  assert.equal(own.trainers.length, 1);
  assert.equal(own.canBook, false);
  assert.equal(own.canManage, false);
  assert.ok(!JSON.stringify(own).includes("amountMinor"));
  assert.ok(!JSON.stringify(own).includes("phone"));
  await deny(
    () => pt.get(desk, { ...org, trainerId: trainers[1] }),
    "NOT_FOUND",
  );
  await deny(
    () =>
      pt.members(desk, {
        ...org,
        trainerId: trainers[0],
        branchId: f.a1,
        q: "",
      }),
    "FORBIDDEN",
  );
  await deny(() => pt.post(desk, first), "FORBIDDEN");
  const ownLookup = await pt.members(headers, {
    ...org,
    trainerId: trainers[0],
    branchId: f.a1,
    q: "member",
  });
  assert.equal(ownLookup.rows.length, 3);
  assert.ok(!JSON.stringify(ownLookup).includes("email"));
  const trigger = "pt_journal_fail_" + f.orgA.replaceAll("-", "");
  const beforeFailure = (
    await admin.query(
      "select (select count(*)::int from gym.schedule_slots where organization_id=$1) slots,(select count(*)::int from gym.personal_sessions where organization_id=$1) personal,(select count(*)::int from gym.audit_events where organization_id=$1) audit",
      [f.orgA],
    )
  ).rows[0];
  try {
    await admin.query(
      `create function gym.${trigger}() returns trigger language plpgsql as $$ begin if NEW.organization_id='${f.orgA}'::uuid and NEW.operation='pt.session' then raise exception 'Injected PT journal failure';end if;return NEW;end $$`,
    );
    await admin.query(
      `create trigger ${trigger} before insert on gym.schedule_requests for each row execute function gym.${trigger}()`,
    );
    await assert.rejects(
      pt.post(headers, session(a.id, "18:00", "19:00")),
      /Injected PT journal failure/,
    );
    const afterFailure = (
      await admin.query(
        "select (select count(*)::int from gym.schedule_slots where organization_id=$1) slots,(select count(*)::int from gym.personal_sessions where organization_id=$1) personal,(select count(*)::int from gym.audit_events where organization_id=$1) audit",
        [f.orgA],
      )
    ).rows[0];
    assert.deepEqual(
      afterFailure,
      beforeFailure,
      "Journal failure rolls back slot, linked member session and audit together",
    );
  } finally {
    await admin.query(
      `drop trigger if exists ${trigger} on gym.schedule_requests`,
    );
    await admin.query(`drop function if exists gym.${trigger}()`);
  }
  console.log(
    "PASS persisted trainer assignments/PT agenda, effective dates, eligible PT benefit, exact UTC offset, own-trainer DTO/scope, replay/stale/revocation, trainer/room/member races, adjacency, cancellations and filtered-session edit metadata. No external emails.",
  );
} finally {
  await f.cleanup();
  await pool.end();
  await admin.end();
}
