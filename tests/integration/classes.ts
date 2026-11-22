import { createDashboardService } from "../../src/modules/dashboard/service";
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
try {
  const headers = await login("Owner A"),
    desk = await login("Reception A"),
    manager = await login("Shared Staff"),
    today = todayInZone("Asia/Karachi"),
    date = endOn(today, 2, "days"),
    weekday = new Date(date + "T12:00:00Z").getUTCDay(),
    org = { organizationId: f.orgA },
    reason = "Verify class scheduling",
    trainers = [randomUUID(), randomUUID()],
    rooms = [randomUUID(), randomUUID()];
  for (const [i, id] of trainers.entries()) {
    await training.saveTrainer(headers, {
      ...org,
      id,
      requestKey: randomUUID(),
      name: "Class coach " + i,
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
      name: "Studio " + i,
      capacity: 2,
      active: true,
      reason,
    });
  }
  const p = await plans.create(headers, {
      ...org,
      branchId: f.a1,
      code: "CLASSES-FREE",
      values: {
        name: "Class eligibility",
        amountMinor: 0,
        currency: "PKR",
        durationCount: 30,
        durationUnit: "days",
        accessMode: "home_branch",
        gymFloor: true,
        classes: true,
        personalTraining: true,
      },
      requestKey: randomUUID(),
      reason,
    }),
    ids: string[] = [];
  for (const name of [
    "Class member one",
    "Class member two",
    "No eligible membership",
  ]) {
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
    if (ids.length < 3)
      await memberships.enroll(headers, m.id, {
        ...org,
        mode: "enroll",
        memberVersion: m.version,
        planVersionId: p.versionId,
        startOn: today,
        requestKey: randomUUID(),
        reason,
      });
  }
  const session = {
    ...org,
    operation: "session",
    id: randomUUID(),
    requestKey: randomUUID(),
    branchId: f.a1,
    trainerId: trainers[0],
    roomId: rooms[0],
    title: "Strength class",
    startsAt: date + "T17:00:00+05:00",
    endsAt: date + "T18:00:00+05:00",
    capacity: 1,
    reason,
  };
  const created = await classes.post(headers, session);
  assert.equal((await classes.post(headers, session)).classId, created.classId);
  let data = await classes.get(headers, { ...org, from: date, mode: "day" });
  assert.equal(data.total, 1);
  assert.equal(data.selected?.capacity, 1);
  assert.equal(data.availability[0].startMinute, 360);
  await assert.rejects(
    classes.post(headers, {
      ...session,
      id: randomUUID(),
      requestKey: randomUUID(),
    }),
    { code: "CONFLICT" },
  );
  await assert.rejects(
    classes.post(headers, {
      ...session,
      id: randomUUID(),
      requestKey: randomUUID(),
      startsAt: date + "T17:00:00+04:00",
    }),
    { code: "VALIDATION_ERROR" },
  );
  const book = (memberId: string) => ({
    ...org,
    operation: "book",
    classId: session.id,
    memberId,
    requestKey: randomUUID(),
    reason,
  });
  await assert.rejects(classes.post(desk, book(ids[2])), { code: "CONFLICT" });
  const first = book(ids[0]),
    second = book(ids[1]),
    race = await Promise.allSettled([
      classes.post(desk, first),
      classes.post(desk, second),
    ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  const index = race.findIndex((r) => r.status === "fulfilled"),
    winner = index === 0 ? first : second,
    result = (race[index] as PromiseFulfilledResult<Record<string, unknown>>)
      .value;
  assert.equal((await classes.post(desk, winner)).bookingId, result.bookingId);
  await classes.post(desk, {
    ...org,
    operation: "cancel_booking",
    classId: session.id,
    bookingId: result.bookingId,
    version: 1,
    requestKey: randomUUID(),
    reason: "Release last seat",
  });
  await classes.post(desk, index === 0 ? second : first);
  data = await classes.get(headers, {
    ...org,
    from: date,
    mode: "day",
    classId: session.id,
  });
  assert.equal(data.selected?.booked, 1);
  assert.equal(data.rosterTotal, 2);
  assert.equal(data.roster.filter((r) => r.cancelled).length, 1);
  const other = {
    ...session,
    id: randomUUID(),
    requestKey: randomUUID(),
    title: "Parallel mobility",
    trainerId: trainers[1],
    roomId: rooms[1],
    capacity: 2,
  };
  await classes.post(headers, other);
  await assert.rejects(
    classes.post(desk, {
      ...book(index === 0 ? ids[1] : ids[0]),
      classId: other.id,
    }),
    { code: "CONFLICT" },
  );
  const adjacent = {
    ...session,
    id: randomUUID(),
    requestKey: randomUUID(),
    title: "Adjacent class",
    startsAt: date + "T18:00:00+05:00",
    endsAt: date + "T19:00:00+05:00",
  };
  await classes.post(headers, adjacent);
  await classes.post(desk, {
    ...book(index === 0 ? ids[1] : ids[0]),
    classId: adjacent.id,
  });
  await assert.rejects(
    classes.post(headers, {
      ...session,
      requestKey: randomUUID(),
      version: 1,
      roomId: rooms[1],
    }),
    { code: "CONFLICT" },
  );
  await assert.rejects(
    classes.post(headers, {
      ...org,
      operation: "room",
      id: rooms[1],
      version: 1,
      branchId: f.a1,
      name: "Studio 1",
      capacity: 1,
      active: true,
      requestKey: randomUUID(),
      reason,
    }),
    { code: "CONFLICT" },
  );
  await classes.post(headers, {
    ...org,
    operation: "cancel_session",
    classId: session.id,
    version: 1,
    requestKey: randomUUID(),
    reason: "Cancel class and free resources",
  });
  await classes.post(desk, {
    ...book(index === 0 ? ids[1] : ids[0]),
    classId: other.id,
  });
  const rawClass = {
    ...session,
    id: randomUUID(),
    requestKey: randomUUID(),
    title: "Raw last seat",
    startsAt: date + "T19:00:00+05:00",
    endsAt: date + "T20:00:00+05:00",
  };
  await classes.post(headers, rawClass);
  async function raw(memberId: string, slotId = rawClass.id) {
    const db = await pool.connect();
    try {
      await db.query("begin");
      await db.query("select set_config('app.organization_id',$1,true)", [
        f.orgA,
      ]);
      await db.query(
        "insert into gym.class_bookings(organization_id,slot_id,branch_id,member_id,created_by) values($1,$2,$3,$4,$5)",
        [f.orgA, slotId, f.a1, memberId, f.users["Owner A"].id],
      );
      await db.query("commit");
    } catch (e) {
      await db.query("rollback");
      throw e;
    } finally {
      db.release();
    }
  }
  const rawRace = await Promise.allSettled([raw(ids[0]), raw(ids[1])]);
  assert.equal(
    rawRace.filter((r) => r.status === "fulfilled").length,
    1,
    "Raw DB capacity serializes last seat",
  );
  assert.equal(
    (rawRace.find((r) => r.status === "rejected") as PromiseRejectedResult)
      .reason.code,
    "23514",
  );
  await assert.rejects(
    classes.post(manager, {
      ...session,
      id: randomUUID(),
      requestKey: randomUUID(),
      branchId: f.a2,
    }),
    { code: "NOT_FOUND" },
  );
  await assert.rejects(classes.get(new Headers(), org), {
    code: "UNAUTHENTICATED",
  });
  await assert.rejects(
    classes.get(headers, {
      organizationId: f.orgB,
      classId: session.id,
      from: date,
      mode: "day",
    }),
    { code: "NOT_FOUND" },
  );
  const candidates = await classes.members(desk, {
    ...org,
    classId: rawClass.id,
    q: "Class member",
  });
  assert.equal(candidates.rows.length, 2);
  await admin.query(
    "update gym.staff_memberships set role='trainer' where id=$1",
    [f.memberships.reception],
  );
  await training.saveTrainer(headers, {
    ...org,
    id: trainers[0],
    version: 1,
    requestKey: randomUUID(),
    name: "Linked class coach",
    branchIds: [f.a1],
    loginUserId: f.users["Reception A"].id,
    reason,
  });
  const own = await classes.get(desk, { ...org, from: date, mode: "day" });
  assert.ok(own.rows.length >= 1);
  assert.ok(own.rows.every((r) => r.trainerId === trainers[0]));
  await assert.rejects(
    classes.members(desk, { ...org, classId: rawClass.id, q: "Class member" }),
    { code: "FORBIDDEN" },
  );
  const overlapping = [0, 1].map((i) => ({
    ...session,
    id: randomUUID(),
    requestKey: randomUUID(),
    title: "Concurrent member conflict " + i,
    trainerId: trainers[i],
    roomId: rooms[i],
    capacity: 2,
    startsAt: date + "T20:00:00+05:00",
    endsAt: date + "T21:00:00+05:00",
  }));
  for (const item of overlapping) await classes.post(headers, item);
  const memberRace = await Promise.allSettled(
    overlapping.map((item) =>
      classes.post(headers, { ...book(ids[1]), classId: item.id }),
    ),
  );
  assert.equal(
    memberRace.filter((r) => r.status === "fulfilled").length,
    1,
    "Different classes serialize a member's overlapping reservations",
  );
  const rawOverlapping = overlapping.map((item, i) => ({
    ...item,
    id: randomUUID(),
    requestKey: randomUUID(),
    title: "Raw member conflict " + i,
    startsAt: date + "T21:00:00+05:00",
    endsAt: date + "T22:00:00+05:00",
  }));
  for (const item of rawOverlapping) await classes.post(headers, item);
  const rawMemberRace = await Promise.allSettled(
    rawOverlapping.map((item) => raw(ids[1], item.id)),
  );
  assert.equal(
    rawMemberRace.filter((r) => r.status === "fulfilled").length,
    1,
    "Raw writes cannot concurrently double-book a member across classes",
  );
  assert.equal(
    (
      rawMemberRace.find(
        (r) => r.status === "rejected",
      ) as PromiseRejectedResult
    ).reason.code,
    "23514",
  );
  const ptTrainer = randomUUID();
  await training.saveTrainer(headers, {
    ...org,
    id: ptTrainer,
    requestKey: randomUUID(),
    name: "PT conflict coach",
    branchIds: [f.a1],
    reason,
  });
  await classes.post(headers, {
    ...org,
    operation: "availability",
    id: randomUUID(),
    requestKey: randomUUID(),
    trainerId: ptTrainer,
    branchId: f.a1,
    weekday,
    startMinute: 360,
    endMinute: 1320,
    active: true,
    reason,
  });
  const ptDb = await pool.connect();
  try {
    await ptDb.query("begin");
    await ptDb.query("select set_config('app.organization_id',$1,true)", [
      f.orgA,
    ]);
    const assignment = randomUUID(),
      slot = randomUUID(),
      actor = f.users["Owner A"].id;
    await ptDb.query(
      "insert into gym.trainer_assignments(organization_id,id,trainer_id,branch_id,member_id,start_on,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$7)",
      [f.orgA, assignment, ptTrainer, f.a1, ids[1], today, actor],
    );
    await ptDb.query(
      "insert into gym.schedule_slots(organization_id,id,branch_id,trainer_id,title,starts_at,ends_at,created_by,updated_by) values($1,$2,$3,$4,'PT conflict verification',$5,$6,$7,$7)",
      [
        f.orgA,
        slot,
        f.a1,
        ptTrainer,
        date + "T20:30:00+05:00",
        date + "T21:30:00+05:00",
        actor,
      ],
    );
    await assert.rejects(
      ptDb.query(
        "insert into gym.personal_sessions(organization_id,slot_id,branch_id,trainer_id,member_id,assignment_id,created_by) values($1,$2,$3,$4,$5,$6,$7)",
        [f.orgA, slot, f.a1, ptTrainer, ids[1], assignment, actor],
      ),
      { code: "23514" },
      "PT cannot overlap a class already booked by the member",
    );
  } finally {
    await ptDb.query("rollback");
    ptDb.release();
  }
  const week = await classes.get(headers, { ...org, from: date, mode: "week" });
  assert.equal(
    new Date(week.from + "T12:00:00Z").getUTCDay(),
    1,
    "Week anchors on Monday",
  );
  assert.equal((Date.parse(week.to) - Date.parse(week.from)) / 86400000, 6);
  const noClasses = await plans.create(headers, {
    ...org,
    branchId: f.a1,
    code: "NO-CLASSES",
    values: {
      name: "Gym floor only",
      amountMinor: 0,
      currency: "PKR",
      durationCount: 30,
      durationUnit: "days",
      accessMode: "home_branch",
      gymFloor: true,
      classes: false,
      personalTraining: false,
    },
    requestKey: randomUUID(),
    reason,
  });
  await memberships.enroll(headers, ids[2], {
    ...org,
    mode: "enroll",
    memberVersion: (
      await admin.query("select version from gym.members where id=$1", [ids[2]])
    ).rows[0].version,
    planVersionId: noClasses.versionId,
    startOn: today,
    requestKey: randomUUID(),
    reason,
  });
  assert.equal(
    (
      await classes.members(headers, {
        ...org,
        classId: rawClass.id,
        q: "No eligible",
      })
    ).rows[0].eligible,
    false,
    "Gym floor membership does not confer class access",
  );
  const memberState = (
    await admin.query(
      "select m.version member_version,p.id,p.version from gym.members m join gym.memberships p on p.organization_id=m.organization_id and p.member_id=m.id where m.id=$1",
      [ids[0]],
    )
  ).rows[0];
  await memberships.change(headers, ids[0], {
    ...org,
    operation: "freeze",
    memberVersion: memberState.member_version,
    membershipId: memberState.id,
    version: memberState.version,
    startOn: date,
    endOn: endOn(date, 1, "days"),
    requestKey: randomUUID(),
    reason: "Prospective class-day freeze",
  });
  assert.equal(
    (
      await classes.members(headers, {
        ...org,
        classId: rawClass.id,
        q: "Class member one",
      })
    ).rows[0].eligible,
    false,
    "Session-date freeze blocks class access",
  );
  await admin.query(
    "create function gym.test_class_request_fail() returns trigger language plpgsql as $$ begin raise exception 'Class test rollback';end $$",
  );
  await admin.query(
    "create trigger test_class_request_fail before insert on gym.schedule_requests for each row execute function gym.test_class_request_fail()",
  );
  const before = (
    await admin.query(
      "select count(*)::int n from gym.schedule_rooms where organization_id=$1",
      [f.orgA],
    )
  ).rows[0].n;
  await assert.rejects(
    classes.post(headers, {
      ...org,
      operation: "room",
      id: randomUUID(),
      requestKey: randomUUID(),
      branchId: f.a1,
      name: "Rolled back room",
      capacity: 10,
      active: true,
      reason,
    }),
  );
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.schedule_rooms where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
    before,
    "Journal failure rolls back resource and audit together",
  );
  await admin.query(
    "drop trigger test_class_request_fail on gym.schedule_requests",
  );
  await admin.query("drop function gym.test_class_request_fail()");
  const dashboard = await createDashboardService(security).get(headers, org);
  assert.ok(dashboard.classes?.some((c) => c.id === other.id));
  assert.ok(
    !dashboard.classes?.some((c) => c.id === session.id),
    "Dashboard excludes cancelled classes",
  );
  assert.ok(dashboard.classes?.every((c) => c.branchId === f.a1));
  console.log(
    "PASS classes persisted resources/availability/sessions/roster, replay, eligibility, concurrent last-seat service+rawDB, cancellation/rebooking, trainer/room/member overlaps, adjacency, capacity protection, UTC offset validation, branch/tenant/role/own-trainer scope.",
  );
} finally {
  await admin.query(
    "drop trigger if exists test_class_request_fail on gym.schedule_requests",
  );
  await admin.query("drop function if exists gym.test_class_request_fail()");
  await f.cleanup();
  await pool.end();
  await admin.end();
}
