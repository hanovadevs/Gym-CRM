import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import {
  roleSchema,
  can,
  allowedActions,
  type Action,
  type Role,
} from "./permissions";
import { AccessError } from "./errors";
export const selectionSchema = z
  .object({
    organizationId: z.uuid().optional(),
    branchId: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.uuid().optional(),
    ),
  })
  .strict();
type Session = { user: { id: string; name: string } } | null;
type DirectoryRow = {
  organization_id: string;
  membership_id: string;
  organization_name: string;
};
export type Scope = Readonly<{
  requestId: string;
  userId: string;
  organizationId: string;
  membershipId: string;
  role: Role;
  branchIds: readonly string[];
  authorizedBranchIds: readonly string[];
}>;
/** Server service entry: authenticate fresh, authorize in transaction, then call a trusted repository.
 * A Scope must never be accepted from the browser. All branch-bound queries must filter branchIds.
 */
export function createSecurity(
  pool: Pool,
  getSession: (headers: Headers) => Promise<Session>,
) {
  async function session(headers: Headers) {
    const value = await getSession(headers);
    if (!value) throw new AccessError("UNAUTHENTICATED");
    return value;
  }
  async function run<T>(
    headers: Headers,
    rawSelection: unknown,
    action: Action,
    operation: (
      db: PoolClient,
      scope: Scope,
      identity: NonNullable<Session>,
    ) => Promise<T>,
  ) {
    const identity = await session(headers);
    const parsed = selectionSchema.safeParse(rawSelection);
    if (!parsed.success) throw new AccessError("VALIDATION_ERROR");
    const selection = parsed.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const runtime = await client.query<{ unsafe: boolean }>(`
        select r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole
          or has_database_privilege(current_database(), 'CREATE')
          or has_schema_privilege('gym', 'CREATE')
          or has_schema_privilege('app_auth', 'CREATE')
          or exists (
            select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname in ('gym','app_auth') and pg_has_role(c.relowner, 'USAGE')
          ) as unsafe
        from pg_roles r where r.rolname=current_user
      `);
      if (!runtime.rowCount || runtime.rows[0].unsafe)
        throw new Error("Unsafe database runtime role");
      const directory = await client.query<DirectoryRow>(
        "select * from gym.staff_directory($1)",
        [identity.user.id],
      );
      const chosen = selection.organizationId
        ? directory.rows.find(
            (row) => row.organization_id === selection.organizationId,
          )
        : directory.rows[0];
      if (!chosen)
        throw new AccessError(
          selection.organizationId ? "NOT_FOUND" : "FORBIDDEN",
        );
      await client.query("select set_config('app.organization_id',$1,true)", [
        chosen.organization_id,
      ]);
      if (action === "staff.manage" || action === "settings.manage")
        await client.query(
          "select pg_advisory_xact_lock(hashtextextended($1,0))",
          ["gym-admin:" + chosen.organization_id],
        );
      const organization = await client.query(
        "select active from gym.organizations where id=$1 for share",
        [chosen.organization_id],
      );
      if (!organization.rows[0]?.active) throw new AccessError("FORBIDDEN");
      // Shared row lock serializes membership revocation/role edits with this operation.
      const membership = await client.query(
        "select role from gym.staff_memberships where id=$1 and auth_user_id=$2 and active=true for share",
        [chosen.membership_id, identity.user.id],
      );
      if (!membership.rowCount) throw new AccessError("FORBIDDEN");
      const role = roleSchema.parse(membership.rows[0].role);
      if (!can(role, action)) throw new AccessError("FORBIDDEN");
      const branches =
        role === "owner"
          ? await client.query<{ id: string }>(
              "select id from gym.branches where active=true order by id for share",
            )
          : await client.query<{ id: string }>(
              "select b.id from gym.branches b join gym.staff_branch_grants g on g.organization_id=b.organization_id and g.branch_id=b.id where g.staff_membership_id=$1 and b.active=true order by b.id for share of b,g",
              [chosen.membership_id],
            );
      const branchIds = branches.rows.map((row) => row.id);
      if (selection.branchId && !branchIds.includes(selection.branchId))
        throw new AccessError("NOT_FOUND");
      if (!branchIds.length) throw new AccessError("FORBIDDEN");
      const scope: Scope = Object.freeze({
        requestId: randomUUID(),
        userId: identity.user.id,
        organizationId: chosen.organization_id,
        membershipId: chosen.membership_id,
        role,
        authorizedBranchIds: Object.freeze(branchIds),
        branchIds: Object.freeze(
          selection.branchId ? [selection.branchId] : branchIds,
        ),
      });
      const result = await operation(client, scope, identity);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async function workspace(headers: Headers, selection: unknown) {
    return run(
      headers,
      selection,
      "workspace.read",
      async (db, scope, identity) => {
        const org = await db.query<{
          id: string;
          name: string;
          currency: string;
          time_zone: string;
        }>(
          "select id,name,currency,time_zone from gym.organizations where id=$1",
          [scope.organizationId],
        );
        const branches = await db.query<{
          id: string;
          name: string;
          code: string;
        }>(
          "select id,name,code from gym.branches where id=any($1::uuid[]) order by name,id",
          [[...scope.branchIds]],
        );
        const availableBranches = await db.query<{
          id: string;
          name: string;
          code: string;
        }>(
          "select id,name,code from gym.branches where id=any($1::uuid[]) order by name,id",
          [[...scope.authorizedBranchIds]],
        );
        const directory = await db.query<DirectoryRow>(
          "select * from gym.staff_directory($1)",
          [identity.user.id],
        );
        return {
          userName: identity.user.name,
          organization: {
            id: org.rows[0].id,
            name: org.rows[0].name,
            currency: org.rows[0].currency,
            timeZone: org.rows[0].time_zone,
          },
          role: scope.role,
          branches: branches.rows,
          availableBranches: availableBranches.rows,
          organizations: directory.rows.map((row) => ({
            id: row.organization_id,
            name: row.organization_name,
          })),
          actions: allowedActions(scope.role),
        };
      },
    );
  }
  return { run, workspace };
}
