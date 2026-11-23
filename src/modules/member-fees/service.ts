import "server-only";
import { z } from "zod";
import type { Pool } from "pg";
import type { createSecurity } from "@/server/security/service";
import { parse } from "@/modules/members/service";
import { BusinessError } from "@/server/errors";
import { audit } from "@/server/audit";
import { enqueueFeeDigest, deliverFeeDigest } from "./delivery";
const query = z
  .object({
    organizationId: z.uuid().optional(),
    branchId: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.uuid().optional(),
    ),
    q: z.string().trim().max(100).default(""),
    status: z.enum(["due", "overdue", "all"]).default("due"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
const action = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("settings"),
      organizationId: z.uuid(),
      enabled: z.boolean(),
      version: z.number().int().min(0),
      reason: z.string().trim().min(3).max(300),
    })
    .strict(),
  z
    .object({ operation: z.literal("digest"), organizationId: z.uuid() })
    .strict(),
  z
    .object({
      operation: z.literal("retry"),
      organizationId: z.uuid(),
      id: z.uuid(),
      expectedAttempts: z.number().int().min(1).max(2),
      reviewedUncertain: z.boolean().default(false),
      reason: z.string().trim().min(3).max(300),
    })
    .strict(),
]);
export type FeeDue = {
  memberId: string;
  name: string;
  memberCode: string;
  branchName: string;
  currency: string;
  amountMinor: string;
  agreedAmountMinor: string;
  agreedCurrency: string;
  feeStartOn: string;
  dueOn: string;
  dueKind: "invoice" | "renewal";
  today: string;
  reminderDays: number;
};
export type FeeSchedule = {
  organization: { id: string; name: string; locale: string; timeZone: string };
  branches: { id: string; name: string }[];
  branchId: string;
  query: z.infer<typeof query>;
  rows: FeeDue[];
  total: number;
  page: number;
  reminders: {
    enabled: boolean;
    version: number;
    ownerEmail: string | null;
    history: {
      id: string;
      day: string;
      status: string;
      attempts: number;
      errorCode: string | null;
    }[];
  };
  requestId: string;
};
export function createMemberFeesService(
  security: ReturnType<typeof createSecurity>,
  pool: Pool,
) {
  async function get(headers: Headers, raw: unknown): Promise<FeeSchedule> {
    const q = parse(query, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId, branchId: q.branchId },
      "fees.manage",
      async (db, s, _identity, context) => {
        const data = (
          await db.query(
            `with candidates as(select d.member_id as "memberId",d.member_name name,d.member_code as "memberCode",b.name as "branchName",d.currency,d.amount_minor::text as "amountMinor",d.agreed_amount_minor::text as "agreedAmountMinor",fa.currency as "agreedCurrency",d.start_on::text as "feeStartOn",d.due_on::text as "dueOn",d.due_kind as "dueKind",d.today::text,d.reminder_days as "reminderDays" from gym.member_fee_due d join gym.member_fee_agreements fa on fa.organization_id=d.organization_id and fa.id=d.agreement_id join gym.branches b on b.organization_id=d.organization_id and b.id=d.branch_id where d.organization_id=$1 and d.branch_id=any($2::uuid[]) and (d.member_name ilike $3 or d.member_code ilike $3) and ($4='all' or ($4='overdue' and d.due_on<d.today) or ($4='due' and d.due_on<=d.today+d.reminder_days))), bounds as(select count(*)::int total,greatest(1,least($5::int,(count(*)::int+24)/25)) page from candidates) select total,page,coalesce((select jsonb_agg(r) from(select * from candidates order by "dueOn",name,"memberId" limit 25 offset(select(page-1)*25 from bounds))r),'[]'::jsonb) rows, jsonb_build_object('enabled',coalesce((select enabled from gym.fee_reminder_settings where organization_id=$1),true),'version',coalesce((select version from gym.fee_reminder_settings where organization_id=$1),0),'ownerEmail',(select owner_email from gym.gym_accounts where organization_id=$1),'history',coalesce((select jsonb_agg(h) from(select id,local_day::text as "day",status,attempts,error_code as "errorCode" from gym.fee_reminder_deliveries where organization_id=$1 order by created_at desc,id desc limit 10)h),'[]'::jsonb)) reminders,(select locale from gym.organizations where id=$1) locale from bounds`,
            [
              s.organizationId,
              [...s.branchIds],
              "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%",
              q.status,
              q.page,
            ],
          )
        ).rows[0];
        return {
          ...data,
          organization: {
            id: s.organizationId,
            name: context.organization.name,
            locale: data.locale,
            timeZone: context.organization.time_zone,
          },
          branches: context.branches,
          branchId: q.branchId ?? "",
          query: { ...q, organizationId: s.organizationId, page: data.page },
          requestId: s.requestId,
        };
      },
    );
  }
  async function save(headers: Headers, raw: unknown) {
    const input = parse(action, raw);
    const result = await security.run(
      headers,
      { organizationId: input.organizationId },
      "fees.manage",
      async (db, s) => {
        if (input.operation === "settings") {
          await db.query(
            "select pg_advisory_xact_lock(hashtextextended($1,0))",
            ["fee-reminder-settings:" + s.organizationId],
          );
          const current = (
            await db.query(
              "select version from gym.fee_reminder_settings where organization_id=$1 for update",
              [s.organizationId],
            )
          ).rows[0];
          if ((current?.version ?? 0) !== input.version)
            throw new BusinessError(
              "CONFLICT",
              "Reminder preferences changed. Reload before saving.",
            );
          const row = current
            ? (
                await db.query(
                  "update gym.fee_reminder_settings set enabled=$2,version=version+1,updated_by=$3,updated_at=clock_timestamp() where organization_id=$1 returning version",
                  [s.organizationId, input.enabled, s.userId],
                )
              ).rows[0]
            : (
                await db.query(
                  "insert into gym.fee_reminder_settings(organization_id,enabled,updated_by) values($1,$2,$3) returning version",
                  [s.organizationId, input.enabled, s.userId],
                )
              ).rows[0];
          await audit(
            db,
            s,
            "member_fee.reminder_settings",
            s.organizationId,
            input.reason,
            null,
            { enabled: input.enabled, version: row.version },
          );
          return {
            id: null,
            status: "preferences_saved",
            version: row.version,
            requestId: s.requestId,
          };
        }
        if (input.operation === "digest") {
          await db.query(
            "update gym.fee_reminder_deliveries set status='uncertain',error_code='WORKER_INTERRUPTED' where organization_id=$1 and status='sending' and started_at<now()-interval '10 minutes'",
            [s.organizationId],
          );
          const row = await enqueueFeeDigest(db, s.organizationId);
          if (row.id)
            await audit(
              db,
              s,
              "member_fee.digest_requested",
              row.id,
              "Owner requested daily member fee summary",
              null,
              { status: row.status },
            );
          return { ...row, requestId: s.requestId };
        }
        const job = (
          await db.query(
            "select id,status,attempts from gym.fee_reminder_deliveries where organization_id=$1 and id=$2 for update",
            [s.organizationId, input.id],
          )
        ).rows[0];
        if (!job)
          throw new BusinessError("NOT_FOUND", "Reminder delivery not found.");
        if (
          job.attempts !== input.expectedAttempts ||
          !["failed", "uncertain"].includes(job.status)
        )
          throw new BusinessError(
            "CONFLICT",
            "Delivery changed. Reload and review the latest status before retrying.",
          );
        if (job.status === "uncertain" && !input.reviewedUncertain)
          throw new BusinessError(
            "VALIDATION_ERROR",
            "Check your inbox or mail server first. An uncertain message may already have arrived.",
          );
        await db.query(
          "update gym.fee_reminder_deliveries set status='queued',error_code=null where id=$1",
          [job.id],
        );
        await audit(
          db,
          s,
          "member_fee.digest_retry",
          job.id,
          input.reason,
          { status: job.status, attempts: job.attempts },
          { reviewedUncertain: input.reviewedUncertain },
        );
        return {
          id: job.id as string,
          status: "queued",
          requestId: s.requestId,
        };
      },
    );
    if (result.id && result.status === "queued")
      return {
        ...result,
        status: await deliverFeeDigest(pool, input.organizationId, result.id),
      };
    return result;
  }
  return { get, save };
}
