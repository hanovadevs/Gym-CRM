import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureAuth } from "../../src/server/auth/configure";
import { createSecurity } from "../../src/server/security/service";
import { createMembersService } from "../../src/modules/members/service";
import { createTrainingService } from "../../src/modules/training/service";
import { todayInZone, endOn } from "../../src/modules/plans/format";
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
    throw Error("No email during training storage checks");
  },
});
const security = createSecurity(pool, (h) =>
  auth.api.getSession({ headers: h }),
);
async function runtime<T>(fn: (client: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.organization_id',$1,true)", [
      f.orgA,
    ]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
try {
  const actor = f.users["Owner A"],
    today = todayInZone("Asia/Karachi"),
    day = endOn(today, 1, "days"),
    weekday = new Date(day + "T12:00:00Z").getUTCDay();
  const login = await auth.api.signInEmail({
    body: { email: actor.email, password: actor.password },
    asResponse: true,
  });
  const headers = new Headers({
    cookie: login.headers
      .getSetCookie()
      .map((s) => s.split(";")[0])
      .join(";"),
  });
  const training = createTrainingService(security);
  const profile = {
    organizationId: f.orgA,
    id: randomUUID(),
    requestKey: randomUUID(),
    name: "Directory coach",
    specialties: "Strength",
    phone: "",
    email: "",
    branchIds: [f.a1],
    reason: "Create operational trainer profile",
  };
  const saved = await training.saveTrainer(headers, profile);
  assert.equal(saved.version, 1);
  assert.equal(
    (await training.saveTrainer(headers, profile)).trainerId,
    saved.trainerId,
  );
  await assert.rejects(
    training.saveTrainer(headers, { ...profile, name: "Changed replay" }),
    { code: "CONFLICT" },
  );
  const updated = await training.saveTrainer(headers, {
    ...profile,
    requestKey: randomUUID(),
    version: 1,
    name: "Updated directory coach",
  });
  assert.equal(updated.version, 2);
  await assert.rejects(
    training.saveTrainer(headers, {
      ...profile,
      requestKey: randomUUID(),
      version: 1,
    }),
    { code: "CONFLICT" },
  );
  await assert.rejects(
    training.saveTrainer(headers, {
      ...profile,
      id: randomUUID(),
      requestKey: randomUUID(),
      branchIds: [f.b1],
    }),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    training.saveTrainer(headers, {
      ...profile,
      id: randomUUID(),
      requestKey: randomUUID(),
      loginUserId: f.users["Owner B"].id,
    }),
    { code: "VALIDATION_ERROR" },
  );
  const directory = await training.directory(headers, {
    organizationId: f.orgA,
    q: "Updated directory",
  });
  assert.equal(directory.total, 1);
  assert.equal(directory.rows[0].name, "Updated directory coach");
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.audit_events where organization_id=$1 and entity_id=$2 and action=$3",
        [f.orgA, profile.id, "trainer.save"],
      )
    ).rows[0].n,
    2,
  );
  const desk = f.users["Reception A"];
  const deskLogin = await auth.api.signInEmail({
    body: { email: desk.email, password: desk.password },
    asResponse: true,
  });
  const deskHeaders = new Headers({
    cookie: deskLogin.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join(";"),
  });
  assert.equal(
    (await training.directory(deskHeaders, { organizationId: f.orgA })).total,
    1,
  );
  await assert.rejects(
    training.saveTrainer(deskHeaders, {
      ...profile,
      id: randomUUID(),
      requestKey: randomUUID(),
    }),
    { code: "FORBIDDEN" },
  );
  await admin.query(
    "update gym.staff_memberships set role='trainer' where organization_id=$1 and auth_user_id=$2",
    [f.orgA, desk.id],
  );
  assert.equal(
    (await training.directory(deskHeaders, { organizationId: f.orgA })).total,
    0,
  );
  const ownProfile = {
    ...profile,
    id: randomUUID(),
    requestKey: randomUUID(),
    name: "Linked own coach",
    loginUserId: desk.id,
    email: "coach@example.invalid",
    phone: "555123456",
  };
  await training.saveTrainer(headers, ownProfile);
  const ownDirectory = await training.directory(deskHeaders, {
    organizationId: f.orgA,
  });
  assert.equal(ownDirectory.total, 1);
  assert.equal(ownDirectory.rows[0].id, ownProfile.id);
  assert.equal(ownDirectory.rows[0].email, "");
  assert.equal(ownDirectory.rows[0].phone, "");
  assert.equal(ownDirectory.canManage, false);
  await assert.rejects(
    training.directory(deskHeaders, { organizationId: f.orgB }),
    { code: "NOT_FOUND" },
  );
  await admin.query(
    "update gym.staff_memberships set role='accountant' where organization_id=$1 and auth_user_id=$2",
    [f.orgA, desk.id],
  );
  await assert.rejects(
    training.directory(deskHeaders, { organizationId: f.orgA }),
    { code: "FORBIDDEN" },
  );
  await admin.query(
    "update gym.staff_memberships set role='receptionist' where organization_id=$1 and auth_user_id=$2",
    [f.orgA, desk.id],
  );
  const memberService = createMembersService(security),
    memberIds: string[] = [];
  for (const name of ["Training member one", "Training member two"])
    memberIds.push(
      (
        await memberService.create(headers, {
          organizationId: f.orgA,
          name,
          phone: "",
          email: randomUUID() + "@example.invalid",
          homeBranchId: f.a1,
          joinedOn: today,
          registrationKey: randomUUID(),
        })
      ).member.id,
    );
  const trainerIds = [randomUUID(), randomUUID()],
    roomIds = [randomUUID(), randomUUID()],
    assignments: Record<string, string> = {},
    availability: Record<string, string> = {};
  await runtime(async (db) => {
    for (const [index, id] of trainerIds.entries()) {
      await db.query(
        "insert into gym.trainers(id,organization_id,name,specialties,created_by,updated_by) values($1,$2,$3,'Personal training',$4,$4)",
        [id, f.orgA, "Trainer " + index, actor.id],
      );
      await db.query(
        "insert into gym.trainer_branches(organization_id,trainer_id,branch_id,created_by,updated_by) values($1,$2,$3,$4,$4)",
        [f.orgA, id, f.a1, actor.id],
      );
      availability[id] = (
        await db.query(
          "insert into gym.trainer_availability(organization_id,trainer_id,branch_id,weekday,start_minute,end_minute,created_by,updated_by) values($1,$2,$3,$4,360,1320,$5,$5) returning id",
          [f.orgA, id, f.a1, weekday, actor.id],
        )
      ).rows[0].id;
      for (const memberId of memberIds)
        assignments[id + memberId] = (
          await db.query(
            "insert into gym.trainer_assignments(organization_id,trainer_id,branch_id,member_id,start_on,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$6) returning id",
            [f.orgA, id, f.a1, memberId, today, actor.id],
          )
        ).rows[0].id;
    }
    for (const [index, id] of roomIds.entries())
      await db.query(
        "insert into gym.schedule_rooms(id,organization_id,branch_id,name,normalized_name,capacity,created_by,updated_by) values($1,$2,$3,$4,lower($4),10,$5,$5)",
        [id, f.orgA, f.a1, "Studio " + index, actor.id],
      );
  });
  const instant = (hour: number) =>
    new Date(Date.parse(day + "T00:00:00+05:00") + hour * 3600000);
  async function slot(
    trainerId: string,
    memberId: string,
    roomId: string,
    start = 8,
    end = 9,
  ) {
    return runtime(async (db) => {
      const id = (
        await db.query(
          "insert into gym.schedule_slots(organization_id,branch_id,trainer_id,room_id,title,starts_at,ends_at,created_by,updated_by) values($1,$2,$3,$4,'Personal training',$5,$6,$7,$7) returning id",
          [
            f.orgA,
            f.a1,
            trainerId,
            roomId,
            instant(start),
            instant(end),
            actor.id,
          ],
        )
      ).rows[0].id;
      await db.query(
        "insert into gym.personal_sessions(slot_id,organization_id,branch_id,trainer_id,member_id,assignment_id,created_by) values($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          f.orgA,
          f.a1,
          trainerId,
          memberId,
          assignments[trainerId + memberId],
          actor.id,
        ],
      );
      return id;
    });
  }
  const races = await Promise.allSettled(
    memberIds.map((id) => slot(trainerIds[0], id, roomIds[0])),
  );
  assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
  const blocked = races.find((r) => r.status === "rejected");
  assert.equal(blocked?.status === "rejected" && blocked.reason.code, "23514");
  const winner = races.find((r) => r.status === "fulfilled");
  assert.ok(winner?.status === "fulfilled");
  const participant = (
    await admin.query(
      "select member_id from gym.personal_sessions where slot_id=$1",
      [winner.value],
    )
  ).rows[0].member_id;
  const other = memberIds.find((id) => id !== participant)!;
  await assert.rejects(slot(trainerIds[1], other, roomIds[0]), {
    code: "23514",
  }); // room conflict across trainers
  await assert.rejects(slot(trainerIds[1], participant, roomIds[1]), {
    code: "23514",
  }); // same member across trainers
  await slot(trainerIds[0], participant, roomIds[0], 9, 10); // adjacent is valid
  await runtime(async (db) => {
    for (const [dow, start, end] of [
      [weekday, 1320, 1440],
      [(weekday + 1) % 7, 0, 60],
    ])
      await db.query(
        "insert into gym.trainer_availability(organization_id,trainer_id,branch_id,weekday,start_minute,end_minute,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$7)",
        [f.orgA, trainerIds[0], f.a1, dow, start, end, actor.id],
      );
  });
  await slot(trainerIds[0], participant, roomIds[0], 21, 23); // two adjacent windows
  await slot(trainerIds[0], participant, roomIds[0], 23, 25); // actual gym-local midnight
  await assert.rejects(slot(trainerIds[0], participant, roomIds[0], 25, 26), {
    code: "23514",
  });
  await assert.rejects(
    runtime((db) =>
      db.query(
        "update gym.trainer_assignments set end_on_exclusive=$2,version=version+1 where id=$1",
        [assignments[trainerIds[0] + participant], endOn(day, 1, "days")],
      ),
    ),
    { code: "23514" },
  );
  await assert.rejects(slot(trainerIds[0], participant, roomIds[0], 5, 6), {
    code: "23514",
  });
  await assert.rejects(
    runtime((db) =>
      db.query(
        "update gym.trainers set active=false,version=version+1 where id=$1",
        [trainerIds[0]],
      ),
    ),
    { code: "23514" },
  );
  await assert.rejects(
    runtime((db) =>
      db.query(
        "update gym.trainer_branches set active=false,version=version+1 where trainer_id=$1",
        [trainerIds[0]],
      ),
    ),
    { code: "23514" },
  );
  await assert.rejects(
    runtime((db) =>
      db.query(
        "update gym.trainer_availability set start_minute=600,version=version+1 where id=$1",
        [availability[trainerIds[0]]],
      ),
    ),
    { code: "23514" },
  );
  await assert.rejects(
    runtime((db) =>
      db.query(
        "update gym.trainer_assignments set end_on_exclusive=$2,version=version+1 where id=$1",
        [assignments[trainerIds[0] + participant], day],
      ),
    ),
    { code: "23514" },
  );
  await assert.rejects(
    runtime((db) =>
      db.query(
        "update gym.schedule_rooms set active=false,version=version+1 where id=$1",
        [roomIds[0]],
      ),
    ),
    { code: "23514" },
  );
  await assert.rejects(
    runtime((db) =>
      db.query(
        "update gym.trainers set login_user_id=$2,version=version+1 where id=$1",
        [trainerIds[0], f.users["Owner B"].id],
      ),
    ),
    { code: "23514" },
  );
  await assert.rejects(
    runtime((db) =>
      db.query(
        "insert into gym.schedule_slots(organization_id,branch_id,trainer_id,title,starts_at,ends_at,created_by,updated_by) values($1,$2,$3,'Unlinked appointment',$4,$5,$6,$6)",
        [f.orgA, f.a1, trainerIds[1], instant(11), instant(12), actor.id],
      ),
    ),
    { code: "23514" },
  ); // deferred child guard
  await runtime((db) =>
    db.query(
      "update gym.schedule_slots set cancelled_at=clock_timestamp(),cancelled_by=$2,cancellation_reason='Cancel to release trainer and room',version=version+1 where id=$1",
      [winner.value, actor.id],
    ),
  );
  await slot(trainerIds[1], other, roomIds[0]); // cancellation frees the room
  const client = await pool.connect();
  try {
    assert.equal(
      (await client.query("select count(*)::int n from gym.trainers")).rows[0]
        .n,
      0,
    );
  } finally {
    client.release();
  }
  await assert.rejects(
    runtime((db) =>
      db.query("delete from gym.schedule_slots where id=$1", [winner.value]),
    ),
    { code: "42501" },
  );
  // Isolated timezone fixture: continuous UTC coverage must handle both DST
  // transitions, and a real availability gap cannot be hidden by overlap sums.
  await admin.query(
    "update gym.organizations set time_zone='America/New_York' where id=$1",
    [f.orgA],
  );
  const sunday = 0;
  await runtime(async (db) => {
    for (const [trainer, start, end] of [
      [trainerIds[0], 0, 240],
      [trainerIds[1], 0, 60],
      [trainerIds[1], 120, 240],
    ] as const)
      await db.query(
        "insert into gym.trainer_availability(organization_id,trainer_id,branch_id,weekday,start_minute,end_minute,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$7)",
        [f.orgA, trainer, f.a1, sunday, start, end, actor.id],
      );
    const fall = (
      await db.query(
        "select gym.schedule_covered($1,$2,$3,'2027-11-07T00:30:00-04:00','2027-11-07T02:30:00-05:00') yes",
        [f.orgA, trainerIds[0], f.a1],
      )
    ).rows[0].yes;
    assert.equal(fall, true);
    const gap = (
      await db.query(
        "select gym.schedule_covered($1,$2,$3,'2027-11-07T00:30:00-04:00','2027-11-07T02:30:00-05:00') yes",
        [f.orgA, trainerIds[1], f.a1],
      )
    ).rows[0].yes;
    assert.equal(gap, false);
    const spring = (
      await db.query(
        "select gym.schedule_covered($1,$2,$3,'2027-03-14T01:30:00-05:00','2027-03-14T03:30:00-04:00') yes",
        [f.orgA, trainerIds[0], f.a1],
      )
    ).rows[0].yes;
    assert.equal(spring, true);
  });
  await admin.query(
    "update gym.organizations set time_zone='Asia/Karachi' where id=$1",
    [f.orgA],
  );
  console.log(
    "PASS training: persisted trainer directory/create/update/replay/stale/branch/login/audit checks; raw concurrent trainer/room/member conflicts, adjacent/overnight coverage, DST gap/fold, cancellation, resource guards, deferred child integrity and RLS/no-delete. PT service/API/UI remain incomplete.",
  );
} finally {
  await f.cleanup();
  await pool.end();
  await admin.end();
}
