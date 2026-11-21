import "server-only";
import nodemailer from "nodemailer";
import type { Pool, PoolClient } from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { mailConfig, SYSTEM_SENDER } from "./config";
import { trustedOrigins } from "@/lib/origins";
const payloadSchema = z
  .object({
    email: z.email(),
    url: z.url(),
    gymName: z.string().max(100).optional(),
  })
  .strict();
export async function enqueueMail(
  db: Pick<PoolClient, "query">,
  input: {
    userId: string;
    email: string;
    url: string;
    kind: "recovery" | "invitation";
    organizationId?: string;
    gymName?: string;
  },
) {
  const payload = payloadSchema.parse({
    email: input.email,
    url: input.url,
    ...(input.gymName ? { gymName: input.gymName } : {}),
  });
  const origins = trustedOrigins(
    process.env.APP_URL!,
    process.env.APP_ENV !== "production" &&
      process.env.NODE_ENV !== "production",
  );
  if (!origins.includes(new URL(payload.url).origin))
    throw new Error("Untrusted account link");
  const result = await db.query(
    `insert into app_auth.mail_outbox(auth_user_id,organization_id,kind,payload) select id,$1,$2,$3::jsonb from app_auth."user" where id=$4 and lower(email)=lower($5) returning id`,
    [
      input.organizationId ?? null,
      input.kind,
      JSON.stringify(payload),
      input.userId,
      input.email,
    ],
  );
  if (!result.rowCount)
    throw new Error("Account mail recipient does not match identity");
  return result.rows[0].id as string;
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function accountMessage(
  kind: string,
  payload: z.infer<typeof payloadSchema>,
) {
  const invitation = kind === "invitation",
    title = invitation ? "Set up your staff password" : "Reset your password";
  const intro = invitation
    ? `You have been invited to ${payload.gymName ?? "a gym workspace"} on Mojym.`
    : "A password reset was requested for your Mojym account.";
  return {
    from: { name: "Mojym", address: SYSTEM_SENDER },
    to: payload.email,
    subject: invitation
      ? "Your Mojym staff invitation"
      : "Reset your Mojym password",
    text: `${intro}\n\n${title}:\n${payload.url}\n\nThis link expires in 30 minutes and can be used once. If you did not expect this message, ignore it.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#1E2937"><h1 style="font-size:24px">${title}</h1><p>${escape(intro)}</p><p><a style="display:inline-block;background:#253C58;color:#fff;padding:14px 20px;border-radius:0;text-decoration:none" href="${escape(payload.url)}">${title}</a></p><p>This link expires in 30 minutes and can be used once.</p><p>If you did not expect this message, ignore it.</p><p>Mojym</p></div>`,
  };
}
type Sender = (
  mail: ReturnType<typeof accountMessage> & { messageId: string },
) => Promise<{ messageId: string; accepted: unknown[]; rejected: unknown[] }>;
export async function deliverMail(
  pool: Pool,
  id: string,
  options: {
    retryFailed?: boolean;
    send?: Sender;
    source?: Record<string, string | undefined>;
  } = {},
) {
  const row = (
    await pool.query(
      `update app_auth.mail_outbox set status='sending',attempted_at=now(),error_code=null where id=$1 and (status='pending' or ($2 and status='failed')) returning *`,
      [id, Boolean(options.retryFailed)],
    )
  ).rows[0];
  if (!row)
    return (
      (
        await pool.query(
          "select status from app_auth.mail_outbox where id=$1",
          [id],
        )
      ).rows[0]?.status ?? "missing"
    );
  if (Date.now() - row.created_at.getTime() > 30 * 60 * 1000) {
    await pool.query(
      "update app_auth.mail_outbox set status='expired',payload=null where id=$1",
      [id],
    );
    return "expired";
  }
  let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
  let deliveryStarted = false;
  let deliveryAccepted = false;
  try {
    if (
      row.kind === "invitation" &&
      !(
        await pool.query(
          "select organization_id from gym.staff_directory($1) where organization_id=$2",
          [row.auth_user_id, row.organization_id],
        )
      ).rowCount
    ) {
      await pool.query(
        "update app_auth.mail_outbox set status='expired',payload=null,error_code='STAFF_ACCESS_REVOKED' where id=$1",
        [id],
      );
      return "expired";
    }
    const payload = payloadSchema.parse(row.payload),
      config = mailConfig(options.source ?? process.env);
    const messageId = `<${id}@hanovadevs.com>`;
    if (config.mode === "capture" && !options.send) {
      await mkdir(".local/mail", { recursive: true });
      deliveryStarted = true;
      await writeFile(
        `.local/mail/${id}.json`,
        JSON.stringify({
          ...payload,
          kind: row.kind,
          id,
          from: SYSTEM_SENDER,
          createdAt: new Date().toISOString(),
        }),
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
      deliveryStarted = true;
      const result = await (
        options.send ??
        (async (mail) =>
          transport!.sendMail(mail) as Promise<{
            messageId: string;
            accepted: unknown[];
            rejected: unknown[];
          }>)
      )({ ...accountMessage(row.kind, payload), messageId });
      if (result.rejected.length || !result.accepted.length)
        throw Object.assign(new Error("Recipient rejected"), {
          code: "EENVELOPE",
          responseCode: 550,
        });
    }
    deliveryAccepted = true;
    await pool.query(
      "update app_auth.mail_outbox set status='sent',message_id=$2,payload=null where id=$1",
      [id, messageId],
    );
    return "sent";
  } catch (error) {
    const e = error as { code?: string; responseCode?: number };
    const definitive =
      !deliveryAccepted &&
      (!deliveryStarted ||
        ["EAUTH", "EDNS", "EENVELOPE", "ETLS"].includes(e.code ?? "") ||
        (e.responseCode ?? 0) >= 400);
    const status = definitive ? "failed" : "uncertain";
    await pool.query(
      "update app_auth.mail_outbox set status=$2,error_code=$3 where id=$1",
      [
        id,
        status,
        e.code ??
          (definitive
            ? "CONFIGURATION_OR_TEMPLATE"
            : "DELIVERY_OUTCOME_UNKNOWN"),
      ],
    );
    return status;
  } finally {
    transport?.close();
  }
}
