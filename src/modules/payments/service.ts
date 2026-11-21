import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { createSecurity, Scope } from "@/server/security/service";
import { can } from "@/server/security/permissions";
import { parse } from "@/modules/members/service";
import { audit } from "@/server/audit";
import { BusinessError } from "@/server/errors";
import {
  recordPayment,
  paymentQuery,
  receiptQuery,
  targetsQuery,
  receiptSnapshot,
  type PaymentQuery,
} from "./schemas";
import type {
  PaymentPage,
  PaymentResult,
  Receipt,
  ActivationResult,
} from "./types";
const fields = `p.id,p.invoice_id as "invoiceId",p.member_id as "memberId",p.originating_branch_id as "branchId",p.receipt_number as "receiptNumber",p.amount_minor::text as "amountMinor",p.currency,p.method,p.paid_on::text as "paidOn",p.reference,p.note,p.balance_after_minor::text as "balanceAfterMinor",p.activation_result as "activationResult",to_jsonb(p.created_at)#>>'{}' as "createdAt",p.receipt_snapshot->>'recipientName' as "recipientName",p.receipt_snapshot->>'recipientCode' as "recipientCode",p.receipt_snapshot->>'invoiceNumber' as "invoiceNumber",p.receipt_snapshot->>'description' as description,p.receipt_snapshot->>'branchName' as "branchName"`;
const scopeWhere =
  "p.organization_id=$1 and p.originating_branch_id=any($2::uuid[])";
export async function readPaymentPage(
  db: PoolClient,
  s: Scope,
  q: PaymentQuery,
): Promise<PaymentPage> {
  const r = (
    await db.query(
      `with filtered as(select ${fields},p.created_at from gym.payments p where ${scopeWhere} and ($3::uuid is null or p.member_id=$3) and ($4::uuid is null or p.invoice_id=$4) and ($5='all' or p.method=$5) and ($6::date is null or p.paid_on>=$6) and ($7::date is null or p.paid_on<=$7) and (p.receipt_number ilike $8 or p.reference ilike $8 or p.receipt_snapshot->>'recipientName' ilike $8 or p.receipt_snapshot->>'recipientCode' ilike $8 or p.receipt_snapshot->>'invoiceNumber' ilike $8)), tally as(select count(*)::int total from filtered),bounds as(select total,greatest(1,least($9::int,(total+24)/25)) page from tally) select total,page,coalesce((select jsonb_agg(to_jsonb(r)-'created_at') from(select * from filtered order by "paidOn" desc,created_at desc,id desc limit 25 offset(select(page-1)*25 from bounds))r),'[]'::jsonb) payments,coalesce((select jsonb_agg(r) from(select currency,sum("amountMinor"::bigint)::text as "amountMinor" from filtered group by currency order by currency)r),'[]'::jsonb) summary from bounds`,
      [
        s.organizationId,
        [...s.branchIds],
        q.memberId ?? null,
        q.invoiceId ?? null,
        q.method,
        q.from ?? null,
        q.to ?? null,
        "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%",
        q.page,
      ],
    )
  ).rows[0];
  return {
    ...r,
    pageSize: 25,
    query: { ...q, organizationId: s.organizationId, page: r.page },
    requestId: s.requestId,
  };
}
async function receipt(db: PoolClient, s: Scope, id: string): Promise<Receipt> {
  const r = (
    await db.query(
      `select ${fields},p.receipt_snapshot as snapshot,b.balance_minor::text as "invoiceBalanceMinor" from gym.payments p join gym.invoice_balances b on b.organization_id=p.organization_id and b.invoice_id=p.invoice_id where ${scopeWhere} and p.id=$3`,
      [s.organizationId, [...s.branchIds], id],
    )
  ).rows[0];
  if (!r) throw new BusinessError("NOT_FOUND", "Receipt not found.");
  const { snapshot, invoiceBalanceMinor, ...payment } = r;
  return {
    payment,
    snapshot: receiptSnapshot.parse(snapshot),
    invoiceBalanceMinor,
    organization: (
      await db.query("select id,name from gym.organizations where id=$1", [
        s.organizationId,
      ])
    ).rows[0],
    canManageSettings: can(s.role, "settings.read"),
    canManageMembers: can(s.role, "members.manage"),
    requestId: s.requestId,
  };
}
export function createPaymentsService(
  security: ReturnType<typeof createSecurity>,
) {
  async function list(headers: Headers, raw: unknown) {
    const q = parse(paymentQuery, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId, branchId: q.branchId },
      "billing.read",
      (db, s) => readPaymentPage(db, s, q),
    );
  }
  async function getReceipt(headers: Headers, id: string, raw: unknown) {
    parse(z.uuid(), id);
    const q = parse(receiptQuery, raw);
    return security.run(headers, q, "billing.read", (db, s) =>
      receipt(db, s, id),
    );
  }
  async function download(headers: Headers, id: string, raw: unknown) {
    parse(z.uuid(), id);
    const q = parse(receiptQuery, raw);
    return security.run(headers, q, "billing.read", async (db, s) => {
      const r = await receipt(db, s, id);
      await audit(
        db,
        s,
        "receipt.pdf_requested",
        id,
        "Paid receipt PDF requested",
        null,
        { receiptNumber: r.payment.receiptNumber },
      );
      return r;
    });
  }
  async function targets(headers: Headers, raw: unknown) {
    const q = parse(targetsQuery, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId, branchId: q.branchId },
      "billing.collect",
      async (db, s) => {
        const r = (
          await db.query(
            `with matches as(select i.id,i.number,i.description,i.recipient_name as "recipientName",i.recipient_code as "recipientCode",i.branch_name as "branchName",b.balance_minor::text as "balanceMinor",i.currency,i.issued_on::text as "issuedOn" from gym.invoices i join gym.invoice_balances b on b.organization_id=i.organization_id and b.invoice_id=i.id where i.organization_id=$1 and i.originating_branch_id=any($2::uuid[]) and b.balance_minor>0 and (i.number ilike $3 or i.recipient_name ilike $3 or i.recipient_code ilike $3))select(select count(*)::int from matches) total,coalesce((select jsonb_agg(r) from(select * from matches order by "recipientName",number,id limit 25)r),'[]'::jsonb) invoices from matches limit 1`,
            [
              s.organizationId,
              [...s.branchIds],
              "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%",
            ],
          )
        ).rows[0] ?? { total: 0, invoices: [] };
        return { ...r, requestId: s.requestId };
      },
    );
  }
  async function record(
    headers: Headers,
    raw: unknown,
  ): Promise<PaymentResult> {
    const input = parse(recordPayment, raw);
    return security.run(
      headers,
      { organizationId: input.organizationId },
      "billing.collect",
      async (db, s) => {
        await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          "payment-request:" +
            s.organizationId +
            ":" +
            s.userId +
            ":" +
            input.requestKey,
        ]);
        const hash = createHash("sha256")
          .update(JSON.stringify(input))
          .digest("hex");
        const old = (
          await db.query(
            `select ${fields},p.request_hash from gym.payments p where p.organization_id=$1 and p.actor_id=$2 and p.request_key=$3`,
            [s.organizationId, s.userId, input.requestKey],
          )
        ).rows[0];
        if (old && !s.branchIds.includes(old.branchId))
          throw new BusinessError("NOT_FOUND", "Payment not found.");
        if (old) {
          if (old.request_hash !== hash)
            throw new BusinessError(
              "CONFLICT",
              "This request key was used for a different payment. Keep the original request or start a new payment.",
            );
          return {
            paymentId: old.id,
            receiptNumber: old.receiptNumber,
            balanceAfterMinor: old.balanceAfterMinor,
            activationResult: old.activationResult,
            requestId: s.requestId,
          };
        }
        const identity = (
          await db.query(
            "select member_id from gym.invoices where organization_id=$1 and id=$2 and originating_branch_id=any($3::uuid[])",
            [s.organizationId, input.invoiceId, [...s.branchIds]],
          )
        ).rows[0];
        if (!identity)
          throw new BusinessError("NOT_FOUND", "Invoice not found.");
        // Same order as lifecycle/contact/archive: member first, then invoice.
        const member = (
          await db.query(
            "select id,archived_at,version from gym.members where organization_id=$1 and id=$2 for update",
            [s.organizationId, identity.member_id],
          )
        ).rows[0];
        await db.query(
          "select id from gym.invoices where organization_id=$1 and id=$2 for update",
          [s.organizationId, input.invoiceId],
        );
        // This statement starts after any lock wait, so its aggregate is fresh.
        const inv = (
          await db.query(
            `select i.*,b.balance_minor::text as balance from gym.invoices i join gym.invoice_balances b on b.organization_id=i.organization_id and b.invoice_id=i.id where i.organization_id=$1 and i.id=$2`,
            [s.organizationId, input.invoiceId],
          )
        ).rows[0];
        if (inv.status !== "issued")
          throw new BusinessError(
            "CONFLICT",
            "Issue this invoice before recording a payment.",
          );
        if (input.currency !== inv.currency)
          throw new BusinessError(
            "VALIDATION_ERROR",
            "Use the invoice currency. Payments cannot convert currency.",
          );
        if (input.expectedBalanceMinor !== inv.balance)
          throw new BusinessError(
            "CONFLICT",
            "The invoice balance changed. Reload the latest balance before recording another payment.",
          );
        const amount = BigInt(input.amountMinor),
          balance = BigInt(inv.balance);
        if (amount > balance || balance <= 0n)
          throw new BusinessError(
            "CONFLICT",
            "This payment exceeds the remaining invoice balance.",
          );
        const organization = (
          await db.query(
            `select receipt_prefix,(current_timestamp at time zone time_zone)::date::text today from gym.organizations where id=$1 for share`,
            [s.organizationId],
          )
        ).rows[0];
        const today = organization.today;
        const issueDay = (
          await db.query(
            'select issued_on::text as "issueDay" from gym.invoices where id=$1 and organization_id=$2',
            [input.invoiceId, s.organizationId],
          )
        ).rows[0].issueDay;
        if (input.paidOn < issueDay || input.paidOn > today)
          throw new BusinessError(
            "VALIDATION_ERROR",
            "The payment date must be between the invoice issue date and today.",
          );
        const after = balance - amount;
        let activation: ActivationResult = inv.membership_id
          ? "partial"
          : "not_linked";
        if (inv.membership_id && after === 0n) {
          const m = (
            await db.query(
              "select lifecycle,activated_at,cancelled_effective_on,end_on_exclusive::text as end from gym.memberships where organization_id=$1 and id=$2 for update",
              [s.organizationId, inv.membership_id],
            )
          ).rows[0];
          if (member.archived_at) activation = "archived";
          else if (m.lifecycle === "cancelled" || m.cancelled_effective_on)
            activation = "cancelled";
          else if (m.end <= today) activation = "expired";
          else if (m.activated_at) activation = "already_active";
          else {
            await db.query(
              "update gym.memberships set lifecycle='active',activated_at=now(),version=version+1 where organization_id=$1 and id=$2",
              [s.organizationId, inv.membership_id],
            );
            activation = "activated";
          }
        }
        const counter = (
          await db.query(
            "insert into gym.number_counters(organization_id,kind,value) values($1,'receipt',1) on conflict(organization_id,kind) do update set value=gym.number_counters.value+1 returning value::text",
            [s.organizationId],
          )
        ).rows[0].value;
        const number =
          organization.receipt_prefix + "-RC-" + counter.padStart(6, "0");
        const payment = (
          await db.query(
            `insert into gym.payments(organization_id,invoice_id,member_id,originating_branch_id,receipt_number,amount_minor,currency,method,paid_on,reference,note,balance_after_minor,activation_result,receipt_snapshot,actor_id,request_key,request_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'{}'::jsonb,$14,$15,$16) returning id,balance_after_minor::text as balance`,
            [
              s.organizationId,
              input.invoiceId,
              member.id,
              inv.originating_branch_id,
              number,
              input.amountMinor,
              input.currency,
              input.method,
              input.paidOn,
              input.reference,
              input.note,
              after.toString(),
              activation,
              s.userId,
              input.requestKey,
              hash,
            ],
          )
        ).rows[0];
        await db.query(
          `insert into gym.payment_allocations(organization_id,payment_id,invoice_id,member_id,originating_branch_id,currency,amount_minor) values($1,$2,$3,$4,$5,$6,$7)`,
          [
            s.organizationId,
            payment.id,
            input.invoiceId,
            member.id,
            inv.originating_branch_id,
            input.currency,
            input.amountMinor,
          ],
        );
        await db.query(
          "update gym.members set version=version+1,updated_by=$3,updated_at=now() where organization_id=$1 and id=$2",
          [s.organizationId, member.id, s.userId],
        );
        await audit(
          db,
          s,
          "payment.recorded",
          payment.id,
          "Manual payment recorded",
          null,
          {
            invoiceId: input.invoiceId,
            memberId: member.id,
            receiptNumber: number,
            amountMinor: input.amountMinor,
            currency: input.currency,
            method: input.method,
            paidOn: input.paidOn,
            balanceAfterMinor: payment.balance,
            activationResult: activation,
          },
        );
        if (activation === "activated")
          await audit(
            db,
            s,
            "membership.activated_by_payment",
            inv.membership_id,
            "Invoice fully settled by recorded payment",
            null,
            { paymentId: payment.id, invoiceId: input.invoiceId },
          );
        return {
          paymentId: payment.id,
          receiptNumber: number,
          balanceAfterMinor: payment.balance,
          activationResult: activation,
          requestId: s.requestId,
        };
      },
    );
  }
  return { list, receipt: getReceipt, download, targets, record };
}
