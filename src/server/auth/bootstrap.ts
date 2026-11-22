import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Client } from "pg";
import { configureAuth } from "./configure";
const input = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().toLowerCase(),
  password: z.string().min(12).max(128),
  gymName: z.string().trim().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});
// CLI-only administrative bootstrap. Never import into an HTTP entry point.
export async function bootstrapOwner(
  client: Client,
  raw: unknown,
  options: { secret: string; baseURL: string },
) {
  const parsed = input.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      "Invalid bootstrap fields: " +
        parsed.error.issues.map((i) => i.path.join(".")).join(", "),
    );
  const data = parsed.data;
  await client.query("BEGIN");
  try {
    await client.query(
      "select pg_advisory_xact_lock(hashtext('jym-first-owner'))",
    );
    if (
      (await client.query("select 1 from gym.organizations limit 1")).rowCount
    )
      throw new Error(
        "Workspace already initialized; use authorized staff provisioning",
      );
    const auth = configureAuth(client, {
      ...options,
      allowProvisioning: true,
      sendReset: async () => {
        throw new Error("Not available during setup");
      },
    });
    const result = await auth.api.signUpEmail({
      body: { name: data.name, email: data.email, password: data.password },
    });
    const org = await client.query(
      "insert into gym.organizations(name,slug) values($1,$2) returning id",
      [data.gymName, data.slug],
    );
    const orgId = org.rows[0].id;
    const branch = await client.query(
      "insert into gym.branches(organization_id,code,name) values($1,'MAIN','Main branch') returning id",
      [orgId],
    );
    const staff = await client.query(
      "insert into gym.staff_memberships(organization_id,auth_user_id,role) values($1,$2,'owner') returning id",
      [orgId, result.user.id],
    );
    await client.query(
      "insert into gym.staff_branch_grants(organization_id,staff_membership_id,branch_id) values($1,$2,$3)",
      [orgId, staff.rows[0].id, branch.rows[0].id],
    );
    await client.query(
      "insert into gym.gym_accounts(organization_id,auth_user_id,owner_email,created_by,updated_by) values($1,$2,$3,$2,$2)",
      [
        orgId,
        result.user.id,
        /\.(local|localhost|invalid|test)$/i.test(data.email)
          ? null
          : data.email,
      ],
    );
    await client.query(
      'insert into gym.audit_events(organization_id,actor_user_id,action,entity_id,request_id,reason,"after") values($1,$2,$3,$1,$4,$5,$6::jsonb)',
      [
        orgId,
        result.user.id,
        "organization.bootstrap",
        randomUUID(),
        "Controlled local owner setup",
        JSON.stringify({
          role: "owner",
          active: true,
          branchId: branch.rows[0].id,
        }),
      ],
    );
    await client.query("COMMIT");
    return { userId: result.user.id, organizationId: orgId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
