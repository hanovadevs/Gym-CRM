import type { Client } from "pg";
import { randomUUID, randomBytes } from "node:crypto";
import { configureAuth } from "../../../src/server/auth/configure";
export async function securityFixture(
  admin: Client,
  secret: string,
  baseURL: string,
) {
  if (
    (await admin.query("select current_database() as name")).rows[0].name !==
    "gym_test"
  )
    throw new Error("Only isolated gym_test fixtures allowed");
  const orgA = randomUUID(),
    orgB = randomUUID(),
    a1 = randomUUID(),
    a2 = randomUUID(),
    b1 = randomUUID();
  const setup = configureAuth(admin, {
    secret,
    baseURL,
    allowProvisioning: true,
    sendReset: async () => {},
  });
  const users: Record<
    string,
    { id: string; email: string; password: string; name: string }
  > = {};
  async function cleanup() {
    for (const table of [
      "billing_requests",
      "billing_reversals",
      "billing_payments",
      "billing_charges",
    ])
      await admin.query(
        `delete from platform.${table} where organization_id=any($1::uuid[])`,
        [[orgA, orgB]],
      );
    for (const table of [
      "gym_accounts",
      "payroll_requests",
      "payroll_payments",
      "payroll_charges",
      "employees",
      "class_bookings",
      "class_sessions",
      "schedule_requests",
      "personal_sessions",
      "schedule_slots",
      "trainer_assignments",
      "trainer_availability",
      "trainer_branches",
      "trainers",
      "schedule_rooms",
      "expense_reversals",
      "expenses",
      "expense_categories",
      "private_files",
      "attendance_requests",
      "attendance_visits",
      "member_access_tokens",
      "financial_corrections",
      "payment_allocations",
      "payments",
      "billing_requests",
      "invoice_items",
      "membership_requests",
      "membership_freezes",
      "invoices",
      "memberships",
    ])
      await admin.query(
        `delete from gym.${table} where organization_id=any($1::uuid[])`,
        [[orgA, orgB]],
      );
    await admin.query(
      "delete from gym.plan_versions where organization_id=any($1::uuid[])",
      [[orgA, orgB]],
    );
    await admin.query(
      "delete from gym.plans where organization_id=any($1::uuid[])",
      [[orgA, orgB]],
    );
    await admin.query(
      "delete from app_auth.mail_outbox where organization_id=any($1::uuid[]) or auth_user_id=any($2::text[])",
      [[orgA, orgB], Object.values(users).map((u) => u.id)],
    );
    await admin.query(
      "delete from gym.member_note_withdrawals where organization_id=any($1::uuid[])",
      [[orgA, orgB]],
    );
    await admin.query(
      "delete from gym.member_notes where organization_id=any($1::uuid[])",
      [[orgA, orgB]],
    );
    await admin.query(
      "delete from gym.member_contacts where organization_id=any($1::uuid[])",
      [[orgA, orgB]],
    );
    await admin.query(
      "delete from gym.members where organization_id=any($1::uuid[])",
      [[orgA, orgB]],
    );
    await admin.query(
      "delete from gym.number_counters where organization_id=any($1::uuid[])",
      [[orgA, orgB]],
    );
    await admin.query(
      "delete from gym.audit_events where organization_id=any($1::uuid[])",
      [[orgA, orgB]],
    );
    await admin.query(
      "delete from gym.staff_branch_grants where organization_id=any($1::uuid[])",
      [[orgA, orgB]],
    );
    await admin.query(
      "delete from gym.staff_memberships where organization_id=any($1::uuid[])",
      [[orgA, orgB]],
    );
    await admin.query(
      "delete from gym.branches where organization_id=any($1::uuid[])",
      [[orgA, orgB]],
    );
    await admin.query(
      "delete from gym.organizations where id=any($1::uuid[])",
      [[orgA, orgB]],
    );
    await admin.query('delete from app_auth."user" where id=any($1::text[])', [
      Object.values(users).map((u) => u.id),
    ]);
  }
  try {
    for (const name of ["Owner A", "Owner B", "Reception A", "Shared Staff"]) {
      const email = `${randomUUID()}@example.invalid`,
        password = randomBytes(20).toString("hex");
      const result = await setup.api.signUpEmail({
        body: { name, email, password },
      });
      users[name] = { id: result.user.id, name, email, password };
    }
    await admin.query(
      "insert into gym.organizations(id,name,slug) values($1,$2,$3),($4,$5,$6)",
      [orgA, "Scope Gym A", orgA, orgB, "Scope Gym B", orgB],
    );
    for (const [id, org, name] of [
      [a1, orgA, "Central"],
      [a2, orgA, "North"],
      [b1, orgB, "Private B"],
    ])
      await admin.query(
        "insert into gym.branches(id,organization_id,code,name) values($1,$2,$3,$4)",
        [id, org, name.toUpperCase().replaceAll(" ", "-"), name],
      );
    const memberships: Record<string, string> = {};
    for (const [key, name, org, role, branch] of [
      ["ownerA", "Owner A", orgA, "owner", a1],
      ["ownerB", "Owner B", orgB, "owner", b1],
      ["reception", "Reception A", orgA, "receptionist", a1],
      ["sharedA", "Shared Staff", orgA, "manager", a1],
      ["sharedB", "Shared Staff", orgB, "manager", b1],
    ]) {
      const id = randomUUID();
      memberships[key] = id;
      await admin.query(
        "insert into gym.staff_memberships(id,organization_id,auth_user_id,role) values($1,$2,$3,$4)",
        [id, org, users[name].id, role],
      );
      await admin.query(
        "insert into gym.staff_branch_grants(organization_id,staff_membership_id,branch_id) values($1,$2,$3)",
        [org, id, branch],
      );
    }
    return { orgA, orgB, a1, a2, b1, users, memberships, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
