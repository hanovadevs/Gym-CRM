import "server-only";
import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { createSecurity, Scope } from "@/server/security/service";
import { audit } from "@/server/audit";
import { BusinessError } from "./errors";
import {
  settingsFields,
  settingsQuery,
  managerFields,
  updateSettings,
  updateStaff,
  createStaff,
  branchWrite,
} from "./schemas";
import type { SettingsData, Branch, Staff } from "./types";
const columns = {
  name: "name",
  phone: "phone",
  email: "email",
  address: "address",
  currency: "currency",
  timeZone: "time_zone",
  locale: "locale",
  receiptPrefix: "receipt_prefix",
  receiptFooter: "receipt_footer",
  graceDays: "grace_days",
  debtBlocksAccess: "debt_blocks_access",
  paidActivation: "paid_activation",
} as const;
const select = Object.entries(columns)
  .map(([key, column]) => `${column} as "${key}"`)
  .join(",");
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw new BusinessError(
      "VALIDATION_ERROR",
      "Check these fields: " +
        [
          ...new Set(
            result.error.issues.map((i) => i.path.join(".") || "form"),
          ),
        ].join(", "),
    );
  return result.data;
}
async function checkGrants(
  db: PoolClient,
  role: string,
  active: boolean,
  ids: string[],
) {
  const result = await db.query(
    "select id,active from gym.branches where id=any($1::uuid[])",
    [ids],
  );
  if (result.rowCount !== ids.length)
    throw new BusinessError("NOT_FOUND", "A branch was not found.");
  if (
    active &&
    role !== "owner" &&
    (!ids.length || result.rows.some((b) => !b.active))
  )
    throw new BusinessError(
      "VALIDATION_ERROR",
      "Active staff need at least one active branch; remove inactive grants.",
    );
}
async function replaceGrants(
  db: PoolClient,
  scope: Scope,
  id: string,
  ids: string[],
) {
  await db.query(
    "delete from gym.staff_branch_grants where staff_membership_id=$1",
    [id],
  );
  for (const branchId of ids)
    await db.query(
      "insert into gym.staff_branch_grants(organization_id,staff_membership_id,branch_id) values($1,$2,$3)",
      [scope.organizationId, id, branchId],
    );
}
export function createSettingsService(
  security: ReturnType<typeof createSecurity>,
  provision: (
    db: PoolClient,
    input: {
      name: string;
      email: string;
      password: string;
      invite?: boolean;
      organizationId?: string;
    },
  ) => Promise<{ id: string; mailId?: string }>,
) {
  async function get(
    headers: Headers,
    selection: unknown,
  ): Promise<SettingsData> {
    const query = parse(settingsQuery, selection);
    return security.run(
      headers,
      { organizationId: query.organizationId, branchId: query.branchId },
      "settings.read",
      async (db, scope) => {
        const row = (
          await db.query(
            `select settings_version as version,${select} from gym.organizations where id=$1`,
            [scope.organizationId],
          )
        ).rows[0];
        const { version, ...values } = row;
        const branches = (
          await db.query<Branch>(
            scope.role === "owner"
              ? "select id,name,code,active,version from gym.branches order by name,id"
              : "select id,name,code,active,version from gym.branches where id=any($1::uuid[]) order by name,id",
            scope.role === "owner" ? [] : [[...scope.authorizedBranchIds]],
          )
        ).rows;
        let staff: Staff[] = [],
          events: SettingsData["audit"] = [];
        let staffPage = 1,
          staffTotal = 0;
        if (scope.role === "owner") {
          staffTotal = (
            await db.query(
              "select count(*)::int as count from gym.staff_memberships",
            )
          ).rows[0].count;
          staffPage = Math.min(
            query.staffPage,
            Math.max(1, Math.ceil(staffTotal / 25)),
          );
          staff = (
            await db.query<Staff>(
              `select s.id,u.name,u.email,s.role,s.active,s.version,coalesce((select array_agg(g.branch_id order by g.branch_id) from gym.staff_branch_grants g where g.staff_membership_id=s.id),array[]::uuid[]) as "branchIds",o.id as "invitationId",o.status as "invitationStatus" from gym.staff_memberships s join app_auth."user" u on u.id=s.auth_user_id left join lateral (select id,status from app_auth.mail_outbox where organization_id=s.organization_id and auth_user_id=s.auth_user_id and kind='invitation' order by created_at desc limit 1) o on true order by u.name,s.id limit 25 offset $1`,
              [(staffPage - 1) * 25],
            )
          ).rows;
          events = (
            await db.query(
              "select e.id,e.action,e.reason,u.name as \"actorName\",e.occurred_at as \"occurredAt\" from gym.audit_events e join app_auth.\"user\" u on u.id=e.actor_user_id where e.action like 'settings.%' or e.action like 'staff.%' or e.action like 'branch.%' or e.action='organization.bootstrap' order by e.occurred_at desc,e.id desc limit 20",
            )
          ).rows.map((r) => ({ ...r, occurredAt: r.occurredAt.toISOString() }));
        }
        return {
          organizationId: scope.organizationId,
          version,
          values: settingsFields.parse(values),
          editableFields:
            scope.role === "owner" ? Object.keys(columns) : [...managerFields],
          canManageStaff: scope.role === "owner",
          branches,
          staff,
          staffPage,
          staffTotal,
          audit: events,
          requestId: scope.requestId,
        };
      },
    );
  }
  async function save(headers: Headers, raw: unknown) {
    const input = parse(updateSettings, raw);
    return security.run(
      headers,
      { organizationId: input.organizationId },
      "settings.manage",
      async (db, scope) => {
        const keys = Object.keys(input.changes) as (keyof typeof columns)[];
        if (
          scope.role !== "owner" &&
          keys.some(
            (key) => !(managerFields as readonly string[]).includes(key),
          )
        )
          throw new BusinessError(
            "FORBIDDEN",
            "Only an owner can change branding, financial preferences or access policy.",
          );
        const before = (
          await db.query(
            "select settings_version from gym.organizations where id=$1 for update",
            [scope.organizationId],
          )
        ).rows[0];
        if (before.settings_version !== input.version)
          throw new BusinessError(
            "CONFLICT",
            "Settings changed since you opened this form. Reload before saving.",
          );
        const values = keys.map((key) => input.changes[key]);
        await db.query(
          `update gym.organizations set ${keys.map((key, i) => `${columns[key]}=$${i + 1}`).join(",")},settings_version=settings_version+1 where id=$${keys.length + 1}`,
          [...values, scope.organizationId],
        );
        await audit(
          db,
          scope,
          "settings.updated",
          scope.organizationId,
          input.reason,
          { version: input.version },
          { version: input.version + 1, changedFields: keys },
        );
        return { version: input.version + 1, requestId: scope.requestId };
      },
    );
  }
  async function staffSave(headers: Headers, raw: unknown) {
    const input = parse(updateStaff, raw);
    return security.run(
      headers,
      { organizationId: input.organizationId },
      "staff.manage",
      async (db, scope) => {
        const current = (
          await db.query(
            "select id,role,active,version from gym.staff_memberships where id=$1 for update",
            [input.id],
          )
        ).rows[0];
        if (!current)
          throw new BusinessError("NOT_FOUND", "Staff record not found.");
        if (current.version !== input.version)
          throw new BusinessError(
            "CONFLICT",
            "This staff record changed. Reload before saving.",
          );
        await checkGrants(db, input.role, input.active, input.branchIds);
        if (
          current.active &&
          current.role === "owner" &&
          (!input.active || input.role !== "owner")
        ) {
          const owners = await db.query(
            "select id from gym.staff_memberships where active=true and role='owner'",
          );
          if (owners.rowCount! <= 1)
            throw new BusinessError(
              "CONFLICT",
              "Keep at least one active owner. Add another owner before changing this account.",
            );
        }
        const oldGrants = (
          await db.query(
            "select branch_id from gym.staff_branch_grants where staff_membership_id=$1 order by branch_id",
            [input.id],
          )
        ).rows.map((r) => r.branch_id);
        await db.query(
          "update gym.staff_memberships set role=$1,active=$2,version=version+1 where id=$3",
          [input.role, input.active, input.id],
        );
        await replaceGrants(db, scope, input.id, input.branchIds);
        await audit(
          db,
          scope,
          "staff.access_changed",
          input.id,
          input.reason,
          { role: current.role, active: current.active, branchIds: oldGrants },
          {
            role: input.role,
            active: input.active,
            branchIds: input.branchIds,
          },
        );
        return {
          id: input.id,
          version: input.version + 1,
          requestId: scope.requestId,
        };
      },
    );
  }
  async function staffCreate(headers: Headers, raw: unknown) {
    const input = parse(createStaff, raw);
    return security.run(
      headers,
      { organizationId: input.organizationId },
      "staff.manage",
      async (db, scope) => {
        await checkGrants(db, input.role, input.active, input.branchIds);
        await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          "staff-email:" + input.email,
        ]);
        if (
          (
            await db.query('select id from app_auth."user" where email=$1', [
              input.email,
            ])
          ).rowCount
        )
          throw new BusinessError(
            "CONFLICT",
            "This email cannot be provisioned here. Use the existing staff record or contact the account administrator.",
          );
        const identity = await provision(db, {
          name: input.name,
          email: input.email,
          password:
            input.delivery === "email"
              ? randomBytes(32).toString("base64url")
              : input.password!,
          ...(input.delivery === "email"
            ? { invite: true, organizationId: scope.organizationId }
            : {}),
        });
        const staff = (
          await db.query(
            "insert into gym.staff_memberships(organization_id,auth_user_id,role,active) values($1,$2,$3,$4) returning id",
            [scope.organizationId, identity.id, input.role, input.active],
          )
        ).rows[0];
        await replaceGrants(db, scope, staff.id, input.branchIds);
        await audit(
          db,
          scope,
          "staff.provisioned",
          staff.id,
          input.reason,
          null,
          {
            role: input.role,
            active: input.active,
            branchIds: input.branchIds,
          },
        );
        return {
          id: staff.id,
          ...(identity.mailId ? { mailId: identity.mailId } : {}),
          requestId: scope.requestId,
        };
      },
    );
  }
  async function branchSave(headers: Headers, raw: unknown) {
    const input = parse(branchWrite, raw);
    return security.run(
      headers,
      { organizationId: input.organizationId },
      "staff.manage",
      async (db, scope) => {
        let before: Branch | undefined;
        if (input.id) {
          before = (
            await db.query<Branch>(
              "select id,name,code,active,version from gym.branches where id=$1 for update",
              [input.id],
            )
          ).rows[0];
          if (!before)
            throw new BusinessError("NOT_FOUND", "Branch not found.");
          if (before.version !== input.version)
            throw new BusinessError(
              "CONFLICT",
              "This branch changed. Reload before saving.",
            );
          if (
            before.active &&
            !input.active &&
            (
              await db.query(
                "select 1 from gym.attendance_visits where organization_id=$1 and branch_id=$2 and checked_out_at is null limit 1",
                [scope.organizationId, input.id],
              )
            ).rowCount
          )
            throw new BusinessError(
              "CONFLICT",
              "Check out open visits before disabling this branch.",
            );
          if (
            before.active &&
            !input.active &&
            (await db.query("select id from gym.branches where active=true"))
              .rowCount! <= 1
          )
            throw new BusinessError(
              "CONFLICT",
              "Keep at least one active branch so owners can access the gym.",
            );
        } else if (!input.active)
          throw new BusinessError(
            "VALIDATION_ERROR",
            "A new branch must be active.",
          );
        if (
          (
            await db.query(
              "select id from gym.branches where code=$1 and ($2::uuid is null or id<>$2)",
              [input.code, input.id ?? null],
            )
          ).rowCount
        )
          throw new BusinessError(
            "CONFLICT",
            "This branch code is already in use.",
          );
        const saved = input.id
          ? await db.query(
              "update gym.branches set name=$1,code=$2,active=$3,version=version+1 where id=$4 returning id,version",
              [input.name, input.code, input.active, input.id],
            )
          : await db.query(
              "insert into gym.branches(organization_id,name,code,active) values($1,$2,$3,true) returning id,version",
              [scope.organizationId, input.name, input.code],
            );
        await audit(
          db,
          scope,
          input.id ? "branch.updated" : "branch.created",
          saved.rows[0].id,
          input.reason,
          before
            ? { name: before.name, code: before.code, active: before.active }
            : null,
          { name: input.name, code: input.code, active: input.active },
        );
        return { ...saved.rows[0], requestId: scope.requestId };
      },
    );
  }
  return { get, save, staffSave, staffCreate, branchSave };
}
