import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import { AccessError } from "@/server/security/errors";
import { BusinessError } from "@/server/errors";
import { settingsFields } from "@/modules/settings/schemas";
const contact = {
  email: settingsFields.shape.email,
  phone: settingsFields.shape.phone,
  address: settingsFields.shape.address,
};
const reason = z.string().trim().min(3).max(300);
const querySchema = z
  .object({
    search: z.string().trim().max(100).default(""),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    activityPage: z.coerce.number().int().min(1).max(10000).default(1),
    organizationId: z.uuid().optional(),
  })
  .strict();
const mutationSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("create"),
      name: z.string().trim().min(1).max(100),
      slug: z
        .string()
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      ownerName: z.string().trim().min(1).max(100),
      ownerEmail: z.email().toLowerCase(),
      password: z.string().min(12).max(128),
      email: contact.email.default(""),
      phone: contact.phone.default(""),
      address: contact.address.default(""),
      reason,
      requestKey: z.uuid(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("update"),
      organizationId: z.uuid(),
      name: z.string().trim().min(1).max(100),
      active: z.boolean(),
      email: contact.email.optional(),
      phone: contact.phone.optional(),
      address: contact.address.optional(),
      version: z.number().int().positive(),
      reason,
      requestKey: z.uuid(),
    })
    .strict(),
]);
export type PlatformGym = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  version: number;
  email: string;
  phone: string;
  address: string;
  createdAt: string;
  members: number;
  staff: number;
  branches: number;
};
export type PlatformEvent = {
  id: string;
  organizationId: string;
  gymName: string;
  actor: string;
  action: string;
  reason: string;
  occurredAt: string;
  source: string;
};
export type PlatformData = {
  userName: string;
  gyms: PlatformGym[];
  total: number;
  events: PlatformEvent[];
  activityTotal: number;
  page: number;
  activityPage: number;
  search: string;
  organizationId?: string;
  requestId: string;
};
type Identity = { user: { id: string; name: string } } | null;
export function createPlatformService(
  pool: Pool,
  getSession: (headers: Headers) => Promise<Identity>,
  provision: (
    db: PoolClient,
    data: { name: string; email: string; password: string },
  ) => Promise<{ id: string }>,
  secret: string,
) {
  async function run<T>(
    headers: Headers,
    operation: (db: PoolClient, user: NonNullable<Identity>) => Promise<T>,
  ) {
    const user = await getSession(headers);
    if (!user) throw new AccessError("UNAUTHENTICATED");
    const db = await pool.connect();
    try {
      await db.query("begin");
      const unsafe = (
        await db.query(
          "select rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or has_database_privilege(current_database(),'CREATE') or has_schema_privilege('gym','CREATE') or has_schema_privilege('app_auth','CREATE') or has_schema_privilege('platform','CREATE') or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('gym','app_auth','platform') and pg_has_role(c.relowner,'USAGE')) unsafe from pg_roles where rolname=current_user",
        )
      ).rows[0];
      if (!unsafe || unsafe.unsafe) throw Error("Unsafe database runtime role");
      if (
        !(
          await db.query("select platform.authorize($1) allowed", [
            user.user.id,
          ])
        ).rows[0].allowed
      )
        throw new AccessError("FORBIDDEN");
      await db.query("select set_config('app.platform_user_id',$1,true)", [
        user.user.id,
      ]);
      const result = await operation(db, user);
      await db.query("commit");
      return result;
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
  }
  async function available(headers: Headers) {
    try {
      return await run(headers, async () => true);
    } catch (error) {
      if (error instanceof AccessError) return false;
      throw error;
    }
  }
  async function get(headers: Headers, raw: unknown): Promise<PlatformData> {
    return run(headers, async (db, user) => {
      const parsed = querySchema.safeParse(raw);
      if (!parsed.success) throw new AccessError("VALIDATION_ERROR");
      const q = parsed.data;
      const snapshot = (
        await db.query(
          "select platform.directory($1,$2,$3) directory, platform.activity($1,$4,$5) activity",
          [
            user.user.id,
            q.search,
            q.page,
            q.organizationId ?? null,
            q.activityPage,
          ],
        )
      ).rows[0];
      const { directory, activity } = snapshot;
      return {
        userName: user.user.name,
        ...directory,
        events: activity.events,
        activityTotal: activity.total,
        ...q,
        requestId: randomUUID(),
      };
    });
  }
  async function save(headers: Headers, raw: unknown) {
    return run(headers, async (db, user) => {
      const parsed = mutationSchema.safeParse(raw);
      if (!parsed.success)
        throw new BusinessError(
          "VALIDATION_ERROR",
          "Check all fields. Owner passwords require at least 12 characters.",
        );
      const input = parsed.data;
      const hash = createHmac("sha256", secret)
        .update(JSON.stringify(input))
        .digest("hex");
      await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        "platform-request:" + user.user.id + ":" + input.requestKey,
      ]);
      const previous = (
        await db.query(
          'select organization_id,request_hash,"after" from platform.events where actor_user_id=$1 and request_key=$2',
          [user.user.id, input.requestKey],
        )
      ).rows[0];
      if (previous) {
        if (previous.request_hash !== hash)
          throw new BusinessError(
            "CONFLICT",
            "This request was already used with different values. Reload before starting another change.",
          );
        return {
          organizationId: previous.organization_id,
          version: previous.after.version,
          requestId: input.requestKey,
        };
      }
      const id =
        input.operation === "create" ? randomUUID() : input.organizationId;
      await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        "gym-admin:" + id,
      ]);
      await db.query("select set_config('app.organization_id',$1,true)", [id]);
      let before = null,
        after;
      if (input.operation === "create") {
        await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          "account-provision:" + input.ownerEmail,
        ]);
        if (
          (
            await db.query(
              'select 1 from app_auth."user" where lower(email)=$1',
              [input.ownerEmail],
            )
          ).rowCount
        )
          throw new BusinessError(
            "CONFLICT",
            "That email already has an account. Choose a separate owner email for this new gym.",
          );
        const owner = await provision(db, {
          name: input.ownerName,
          email: input.ownerEmail,
          password: input.password,
        });
        await db.query(
          "insert into gym.organizations(id,name,slug,email,phone,address) values($1,$2,$3,$4,$5,$6)",
          [
            id,
            input.name,
            input.slug,
            input.email || input.ownerEmail,
            input.phone,
            input.address,
          ],
        );
        const branch = (
          await db.query(
            "insert into gym.branches(organization_id,code,name) values($1,'MAIN','Main branch') returning id",
            [id],
          )
        ).rows[0];
        const staff = (
          await db.query(
            "insert into gym.staff_memberships(organization_id,auth_user_id,role) values($1,$2,'owner') returning id",
            [id, owner.id],
          )
        ).rows[0];
        await db.query(
          "insert into gym.staff_branch_grants(organization_id,staff_membership_id,branch_id) values($1,$2,$3)",
          [id, staff.id, branch.id],
        );
        after = {
          name: input.name,
          slug: input.slug,
          active: true,
          version: 1,
        };
      } else {
        const org = (
          await db.query(
            "select name,slug,active,email,phone,address,settings_version version from gym.organizations where id=$1 for update",
            [id],
          )
        ).rows[0];
        if (!org) throw new BusinessError("NOT_FOUND", "Gym not found.");
        if (org.version !== input.version)
          throw new BusinessError(
            "CONFLICT",
            "This gym changed since you opened it. Reload before saving.",
          );
        before = {
          name: org.name,
          slug: org.slug,
          active: org.active,
          version: org.version,
        };
        after = {
          name: input.name,
          slug: org.slug,
          active: input.active,
          version: org.version + 1,
        };
        await db.query(
          "update gym.organizations set name=$1,active=$2,email=$4,phone=$5,address=$6,settings_version=settings_version+1 where id=$3",
          [
            input.name,
            input.active,
            id,
            input.email ?? org.email,
            input.phone ?? org.phone,
            input.address ?? org.address,
          ],
        );
      }
      await db.query(
        'insert into platform.events(actor_user_id,organization_id,action,reason,request_key,request_hash,"before","after") values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',
        [
          user.user.id,
          id,
          input.operation === "create" ? "gym.created" : "gym.updated",
          input.reason,
          input.requestKey,
          hash,
          JSON.stringify(before),
          JSON.stringify(after),
        ],
      );
      await db.query(
        'insert into gym.audit_events(organization_id,actor_user_id,action,entity_id,request_id,reason,"before","after") values($1,$2,$3,$1,$4,$5,$6::jsonb,$7::jsonb)',
        [
          id,
          user.user.id,
          input.operation === "create"
            ? "organization.provisioned"
            : "organization.platform_updated",
          input.requestKey,
          input.reason,
          JSON.stringify(before),
          JSON.stringify(after),
        ],
      );
      return {
        organizationId: id,
        version: after.version,
        requestId: input.requestKey,
      };
    }).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "23505")
        throw new BusinessError(
          "CONFLICT",
          "This gym slug or owner email is already in use. No changes were saved.",
        );
      throw error;
    });
  }
  return { available, get, save };
}
