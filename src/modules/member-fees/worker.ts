import "server-only";
import type { Pool } from "pg";
import { enqueueFeeDigest, deliverFeeDigest } from "./delivery";
export async function runFeeReminderWorker(
  pool: Pool,
  options: {
    source?: Record<string, string | undefined>;
    budgetMs?: number;
  } = {},
) {
  const guard = await pool.connect(),
    started = Date.now(),
    budget = Math.min(options.budgetMs ?? 240000, 240000);
  const result = {
    busy: false,
    organizations: 0,
    queued: 0,
    sent: 0,
    failed: 0,
    uncertain: 0,
    skipped: 0,
    partial: false,
  };
  let locked = false;
  try {
    const unsafe = (
      await guard.query(
        "select rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or has_database_privilege(current_database(),'CREATE') or has_schema_privilege('gym','CREATE') or has_schema_privilege('app_auth','CREATE') as unsafe from pg_roles where rolname=current_user",
      )
    ).rows[0]?.unsafe;
    if (unsafe !== false) throw Error("Unsafe reminder-worker database role");
    locked = (
      await guard.query(
        "select pg_try_advisory_lock(hashtextextended('mojym-member-fee-reminders',0)) locked",
      )
    ).rows[0].locked;
    if (!locked) return { ...result, busy: true };
    let cursor: string | null = null;
    while (Date.now() - started < budget) {
      const orgs: { organization_id: string }[] = (
        await guard.query(
          "select organization_id from gym.fee_reminder_organizations($1,100)",
          [cursor],
        )
      ).rows;
      if (!orgs.length) break;
      for (const org of orgs) {
        if (Date.now() - started >= budget) {
          result.partial = true;
          break;
        }
        cursor = org.organization_id;
        result.organizations++;
        await guard.query("begin");
        await guard.query("select set_config('app.organization_id',$1,true)", [
          cursor,
        ]);
        await guard.query(
          "update gym.fee_reminder_deliveries set status='uncertain',error_code='WORKER_INTERRUPTED' where organization_id=$1 and status='sending' and started_at<now()-interval '10 minutes'",
          [cursor],
        );
        await guard.query(
          "update gym.fee_reminder_deliveries set status='skipped',payload=null,error_code='EXPIRED_SUMMARY' where organization_id=$1 and status in ('queued','failed') and local_day<(now() at time zone (select time_zone from gym.organizations where id=$1))::date",
          [cursor],
        );
        const job = await enqueueFeeDigest(guard, cursor!);
        await guard.query("commit");
        if (job.id && job.status === "queued") {
          result.queued++;
          const status = await deliverFeeDigest(pool, cursor!, job.id, {
            source: options.source,
          });
          if (status === "sent") result.sent++;
          else if (status === "failed") result.failed++;
          else if (status === "uncertain") result.uncertain++;
          else result.skipped++;
        }
      }
      if (result.partial || orgs.length < 100) break;
    }
    if (Date.now() - started >= budget) result.partial = true;
    return result;
  } finally {
    await guard.query("rollback").catch(() => {});
    if (locked)
      await guard
        .query(
          "select pg_advisory_unlock(hashtextextended('mojym-member-fee-reminders',0))",
        )
        .catch(() => {});
    guard.release();
  }
}
