import { config } from "dotenv";
import pg from "pg";
import { deliverMail } from "../src/server/mail/service";
config({ path: ".env.local", quiet: true });
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
});
try {
  await pool.query(
    "update app_auth.mail_outbox set status='uncertain',error_code='INTERRUPTED_DELIVERY' where status='sending' and attempted_at<now()-interval '2 minutes'",
  );
  await pool.query(
    "update app_auth.mail_outbox set status='expired',payload=null where status in ('pending','failed','uncertain') and created_at<now()-interval '30 minutes'",
  );
  const jobs = (
    await pool.query(
      "select id from app_auth.mail_outbox where status='pending' order by created_at limit 20",
    )
  ).rows;
  for (const job of jobs)
    console.log(
      JSON.stringify({ id: job.id, status: await deliverMail(pool, job.id) }),
    );
  console.log(
    `Processed ${jobs.length} pending account messages. Uncertain deliveries are never automatically retried.`,
  );
} finally {
  await pool.end();
}
