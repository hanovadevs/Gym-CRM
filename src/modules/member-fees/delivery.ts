import "server-only";
import type { Pool, PoolClient } from "pg";
import nodemailer from "nodemailer";
import type { SendMailOptions } from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { mailConfig, SYSTEM_SENDER } from "@/server/mail/config";
import { exactMoney } from "@/modules/billing/format";
const rowSchema = z.object({
  memberId: z.uuid(),
  name: z.string().max(100),
  memberCode: z.string(),
  dueKind: z.enum(["invoice", "renewal"]),
  dueOn: z.iso.date(),
  amountMinor: z.string().regex(/^[0-9]+$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
const payloadSchema = z.object({
  gymName: z.string().max(100),
  day: z.iso.date(),
  locale: z.string(),
  total: z.number().int().positive(),
  rows: z.array(rowSchema).max(100),
});
export type DigestPayload = z.infer<typeof payloadSchema>;
export async function reminderOrganization(
  db: PoolClient,
  organizationId: string,
) {
  await db.query(
    "select enabled from gym.fee_reminder_settings where organization_id=$1 for share",
    [organizationId],
  );
  return (
    await db.query(
      `select o.name,o.locale,(now() at time zone o.time_zone)::date::text today,a.auth_user_id,a.owner_email,coalesce((select enabled from gym.fee_reminder_settings where organization_id=o.id),true) enabled from gym.organizations o join gym.gym_accounts a on a.organization_id=o.id join gym.staff_memberships sm on sm.organization_id=o.id and sm.auth_user_id=a.auth_user_id and sm.role='owner' and sm.active where o.id=$1 and o.active for share of o,a,sm`,
      [organizationId],
    )
  ).rows[0];
}
export async function currentDigest(
  db: PoolClient,
  organizationId: string,
  org: Record<string, unknown>,
): Promise<DigestPayload | null> {
  const result = (
    await db.query(
      `with due as(select member_id as "memberId",member_name name,member_code as "memberCode",due_kind as "dueKind",due_on::text as "dueOn",amount_minor::text as "amountMinor",currency from gym.member_fee_due where organization_id=$1 and due_on<=today+reminder_days) select (select count(*)::int from due) total,coalesce((select jsonb_agg(r) from(select * from due order by "dueOn",name,"memberId" limit 100)r),'[]'::jsonb) rows`,
      [organizationId],
    )
  ).rows[0];
  if (!result.total) return null;
  return payloadSchema.parse({
    gymName: org.name,
    locale: org.locale,
    day: org.today,
    ...result,
  });
}
export async function enqueueFeeDigest(
  db: PoolClient,
  organizationId: string,
): Promise<{ id: string | null; status: string }> {
  const org = await reminderOrganization(db, organizationId);
  if (!org || !org.enabled || !org.owner_email)
    return { id: null, status: "unavailable" };
  const payload = await currentDigest(db, organizationId, org);
  if (!payload) return { id: null, status: "nothing_due" };
  const row = (
    await db.query(
      `insert into gym.fee_reminder_deliveries(organization_id,local_day,auth_user_id,recipient_email,payload) values($1,$2,$3,$4,$5::jsonb) on conflict(organization_id,local_day) do nothing returning id,status`,
      [
        organizationId,
        org.today,
        org.auth_user_id,
        org.owner_email,
        JSON.stringify(payload),
      ],
    )
  ).rows[0];
  return (
    row ??
    (
      await db.query(
        "select id,status from gym.fee_reminder_deliveries where organization_id=$1 and local_day=$2",
        [organizationId, org.today],
      )
    ).rows[0]
  );
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function digestMessage(payload: DigestPayload, appURL: string) {
  const link = new URL("/member-fees", appURL).href;
  const lines = payload.rows.map(
    (r) =>
      `${r.name} (${r.memberCode}) - ${r.dueKind === "invoice" ? "Invoice balance due" : "Renewal due"} ${r.dueOn}: ${exactMoney(r.amountMinor, r.currency, payload.locale)}`,
  );
  const intro = `${payload.gymName}: ${payload.total} member fee reminder${payload.total === 1 ? "" : "s"} for ${payload.day}.`;
  const note =
    "Invoice balances are unpaid issued charges. Renewal amounts are reminders for the next subscription term and are not issued debt. Review the current CRM before recording a payment or renewal.";
  const overflow =
    payload.total > payload.rows.length
      ? `Showing the first ${payload.rows.length} reminders; see Mojym for the complete schedule.`
      : "";
  return {
    subject: `Mojym | ${payload.gymName}: member fee reminders`,
    text: [
      intro,
      "",
      ...lines,
      "",
      overflow,
      note,
      "",
      `Open fee schedule: ${link}`,
    ]
      .filter(Boolean)
      .join("\n"),
    html: `<h2>${escape(payload.gymName)}</h2><p>${escape(intro)}</p><ul>${lines.map((l) => "<li>" + escape(l) + "</li>").join("")}</ul><p>${escape(overflow)}</p><p>${escape(note)}</p><p><a href="${escape(link)}">Open fee schedule in Mojym</a></p>`,
  };
}
type Options = {
  source?: Record<string, string | undefined>;
  send?: (
    mail: SendMailOptions,
  ) => Promise<{ accepted?: unknown[]; rejected?: unknown[] }>;
};
export async function deliverFeeDigest(
  pool: Pool,
  organizationId: string,
  id: string,
  options: Options = {},
) {
  const db = await pool.connect();
  let transport: ReturnType<typeof nodemailer.createTransport> | undefined,
    sending = false,
    claimed = false;
  try {
    await db.query("begin");
    await db.query("select set_config('app.organization_id',$1,true)", [
      organizationId,
    ]);
    const row = (
      await db.query(
        "select * from gym.fee_reminder_deliveries where organization_id=$1 and id=$2 for update skip locked",
        [organizationId, id],
      )
    ).rows[0];
    if (!row) {
      await db.query("rollback");
      return "busy";
    }
    if (row.status !== "queued" || row.attempts >= 3) {
      await db.query("rollback");
      return row.status as string;
    }
    await db.query(
      "update gym.fee_reminder_deliveries set status='sending',attempts=attempts+1,started_at=clock_timestamp(),error_code=null where id=$1",
      [id],
    );
    await db.query("commit");
    claimed = true;
    await db.query("begin");
    await db.query("select set_config('app.organization_id',$1,true)", [
      organizationId,
    ]);
    const org = await reminderOrganization(db, organizationId);
    // pg DATE is returned as a local Date by default; compare the database calendar text instead.
    const sameDay = (
      await db.query(
        "select local_day=(now() at time zone (select time_zone from gym.organizations where id=$2))::date same_day from gym.fee_reminder_deliveries where id=$1",
        [id, organizationId],
      )
    ).rows[0]?.same_day;
    const payload =
      org &&
      org.enabled &&
      sameDay &&
      org.owner_email === row.recipient_email &&
      org.auth_user_id === row.auth_user_id
        ? await currentDigest(db, organizationId, org)
        : null;
    const source = options.source ?? process.env,
      config = mailConfig(source);
    if (
      !payload ||
      (config.mode === "smtp" &&
        /\.(local|localhost|invalid|test)$/i.test(row.recipient_email))
    ) {
      await db.query(
        "update gym.fee_reminder_deliveries set status='skipped',payload=null,error_code='NO_CURRENT_RECIPIENT_OR_DUES' where id=$1",
        [id],
      );
      await db.query("commit");
      return "skipped";
    }
    const message = {
      from: `Hanova Devs <${SYSTEM_SENDER}>`,
      to: row.recipient_email,
      messageId: `<fee-${id}@hanovadevs.com>`,
      ...digestMessage(payload, source.APP_URL!),
    };
    if (config.mode === "capture" && !options.send) {
      await mkdir(".local/fee-mail", { recursive: true });
      sending = true;
      await writeFile(
        `.local/fee-mail/${id}.json`,
        JSON.stringify({ ...message, payload }),
        { mode: 0o600, flag: "wx" },
      );
    } else {
      if (!options.send)
        transport = nodemailer.createTransport({
          ...config,
          tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
          requireTLS: !config.secure,
          disableFileAccess: true,
          disableUrlAccess: true,
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
        });
      sending = true;
      const result = await (
        options.send ?? (async (mail) => transport!.sendMail(mail))
      )(message);
      if (
        !result.accepted?.some(
          (x: unknown) =>
            String(x).toLowerCase() === row.recipient_email.toLowerCase(),
        )
      )
        throw Object.assign(Error("Recipient not accepted"), {
          code: "RECIPIENT_REJECTED",
        });
    }
    await db.query(
      "update gym.fee_reminder_deliveries set status='sent',sent_at=clock_timestamp(),payload=null,error_code=null where id=$1",
      [id],
    );
    await db.query("commit");
    return "sent";
  } catch (error) {
    await db.query("rollback").catch(() => {});
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "DELIVERY_ERROR";
    const safe =
      !sending ||
      ["EAUTH", "ECONNECTION", "EDNS", "ETLS", "RECIPIENT_REJECTED"].includes(
        code,
      );
    if (claimed) {
      await db.query("begin");
      await db.query("select set_config('app.organization_id',$1,true)", [
        organizationId,
      ]);
      await db.query(
        "update gym.fee_reminder_deliveries set status=$2,error_code=$3 where id=$1 and status='sending'",
        [
          id,
          safe ? "failed" : "uncertain",
          safe ? "DELIVERY_FAILED" : "DELIVERY_UNCERTAIN",
        ],
      );
      await db.query("commit");
    }
    return safe ? "failed" : "uncertain";
  } finally {
    transport?.close();
    await db.query("rollback").catch(() => {});
    db.release();
  }
}
