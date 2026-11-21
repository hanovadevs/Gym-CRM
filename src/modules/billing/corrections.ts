import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { createSecurity } from "@/server/security/service";
import { parse } from "@/modules/members/service";
import { calendarDate } from "@/modules/memberships/schemas";
import { audit } from "@/server/audit";
import { BusinessError } from "@/server/errors";
export const correctionInput = z
  .object({
    organizationId: z.uuid(),
    invoiceId: z.uuid(),
    requestKey: z.uuid(),
    kind: z.enum(["credit", "refund", "refund_credit", "void"]),
    paymentId: z.uuid().optional(),
    amountMinor: z.string().regex(/^(0|[1-9][0-9]{0,11})$/),
    expectedBalanceMinor: z.string().regex(/^(0|[1-9][0-9]{0,11})$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
    cashOn: calendarDate,
    method: z.enum(["cash", "bank_transfer", "other"]).optional(),
    reason: z
      .string()
      .trim()
      .min(3)
      .max(300)
      .refine((v) => !/[\u0000-\u001f\u007f]/.test(v)),
    reference: z
      .string()
      .trim()
      .max(100)
      .refine((v) => !/[\u0000-\u001f\u007f]/.test(v))
      .default(""),
  })
  .strict()
  .refine(
    (v) =>
      (v.kind === "void") === (v.amountMinor === "0") &&
      ["refund", "refund_credit"].includes(v.kind) === !!v.paymentId &&
      ["refund", "refund_credit"].includes(v.kind) === !!v.method,
    "Choose a valid amount and original payment",
  );
export function createCorrectionsService(
  security: ReturnType<typeof createSecurity>,
) {
  return {
    record: async (headers: Headers, raw: unknown) => {
      const v = parse(correctionInput, raw);
      return security.run(
        headers,
        { organizationId: v.organizationId },
        "billing.adjust",
        async (db, s) => {
          await db.query(
            "select pg_advisory_xact_lock(hashtextextended($1,0))",
            [
              "correction:" +
                s.organizationId +
                ":" +
                s.userId +
                ":" +
                v.requestKey,
            ],
          );
          const hash = createHash("sha256")
            .update(JSON.stringify(v))
            .digest("hex");
          const old = (
            await db.query(
              "select id,number,request_hash,originating_branch_id,balance_after_minor::text balance from gym.financial_corrections where organization_id=$1 and actor_id=$2 and request_key=$3",
              [s.organizationId, s.userId, v.requestKey],
            )
          ).rows[0];
          if (old) {
            if (!s.branchIds.includes(old.originating_branch_id))
              throw new BusinessError("NOT_FOUND", "Correction not found.");
            if (old.request_hash !== hash)
              throw new BusinessError(
                "CONFLICT",
                "This key belongs to another correction.",
              );
            return {
              correctionId: old.id,
              number: old.number,
              balanceAfterMinor: old.balance,
              requestId: s.requestId,
            };
          }
          const identity = (
            await db.query(
              "select member_id from gym.invoices where organization_id=$1 and id=$2 and originating_branch_id=any($3::uuid[])",
              [s.organizationId, v.invoiceId, [...s.branchIds]],
            )
          ).rows[0];
          if (!identity)
            throw new BusinessError("NOT_FOUND", "Invoice not found.");
          await db.query(
            "select id from gym.members where organization_id=$1 and id=$2 for update",
            [s.organizationId, identity.member_id],
          );
          await db.query(
            "select id from gym.invoices where organization_id=$1 and id=$2 for update",
            [s.organizationId, v.invoiceId],
          );
          const inv = (
            await db.query(
              "select i.*,b.balance_minor::text balance from gym.invoices i join gym.invoice_balances b on b.organization_id=i.organization_id and b.invoice_id=i.id where i.organization_id=$1 and i.id=$2",
              [s.organizationId, v.invoiceId],
            )
          ).rows[0];
          if (inv.status !== "issued" || inv.currency !== v.currency)
            throw new BusinessError(
              "CONFLICT",
              "Use an issued invoice and its original currency.",
            );
          if (inv.balance !== v.expectedBalanceMinor)
            throw new BusinessError(
              "CONFLICT",
              "The balance changed. Reload before correcting this invoice.",
            );
          const org = (
            await db.query(
              "select receipt_prefix,(current_timestamp at time zone time_zone)::date::text today from gym.organizations where id=$1 for share",
              [s.organizationId],
            )
          ).rows[0];
          const issued = (
            await db.query(
              "select issued_on::text as issued from gym.invoices where id=$1",
              [v.invoiceId],
            )
          ).rows[0].issued;
          if (v.cashOn < issued || v.cashOn > org.today)
            throw new BusinessError(
              "VALIDATION_ERROR",
              "Use a date between issuance and today.",
            );
          if (
            (
              await db.query(
                "select id from gym.financial_corrections where organization_id=$1 and invoice_id=$2 and kind='void'",
                [s.organizationId, v.invoiceId],
              )
            ).rowCount
          )
            throw new BusinessError("CONFLICT", "This invoice is void.");
          const amount = BigInt(v.amountMinor),
            balance = BigInt(inv.balance);
          const prior = (
            await db.query(
              "select coalesce(sum(amount_minor)filter(where kind in('credit','refund_credit')),0)::text credited,count(*)::int count from gym.financial_corrections where organization_id=$1 and invoice_id=$2",
              [s.organizationId, v.invoiceId],
            )
          ).rows[0];
          if (
            v.kind === "void" &&
            (prior.count ||
              (
                await db.query(
                  "select id from gym.payments where organization_id=$1 and invoice_id=$2",
                  [s.organizationId, v.invoiceId],
                )
              ).rowCount)
          )
            throw new BusinessError(
              "CONFLICT",
              "Use an explicit refund or credit for invoices with financial history.",
            );
          if (["refund", "refund_credit"].includes(v.kind)) {
            const p = (
              await db.query(
                "select p.id,p.paid_on::text as paid,p.amount_minor-coalesce((select sum(c.amount_minor)::bigint from gym.financial_corrections c where c.organization_id=p.organization_id and c.payment_id=p.id and c.kind in('refund','refund_credit')),0::bigint) refundable from gym.payments p where p.organization_id=$1 and p.id=$2 and p.invoice_id=$3",
                [s.organizationId, v.paymentId, v.invoiceId],
              )
            ).rows[0];
            if (!p)
              throw new BusinessError(
                "NOT_FOUND",
                "Original payment not found.",
              );
            if (amount > BigInt(p.refundable) || v.cashOn < p.paid)
              throw new BusinessError(
                "CONFLICT",
                "Refund exceeds refundable funds or predates receipt.",
              );
          }
          if (
            ["credit", "refund_credit"].includes(v.kind) &&
            (amount > BigInt(inv.total_minor) - BigInt(prior.credited) ||
              (v.kind === "credit" && amount > balance))
          )
            throw new BusinessError(
              "CONFLICT",
              "Credit exceeds the remaining charge or balance.",
            );
          const n = (
            await db.query(
              "insert into gym.number_counters(organization_id,kind,value) values($1,'adjustment',1) on conflict(organization_id,kind) do update set value=gym.number_counters.value+1 returning value::text",
              [s.organizationId],
            )
          ).rows[0].value;
          const number = org.receipt_prefix + "-ADJ-" + n.padStart(6, "0");
          const row = (
            await db.query(
              "insert into gym.financial_corrections(organization_id,invoice_id,member_id,originating_branch_id,payment_id,kind,number,amount_minor,currency,cash_on,reason,reference,actor_id,request_key,request_hash,balance_after_minor,method) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,$16) returning id,balance_after_minor::text balance",
              [
                s.organizationId,
                v.invoiceId,
                inv.member_id,
                inv.originating_branch_id,
                v.paymentId ?? null,
                v.kind,
                number,
                v.amountMinor,
                v.currency,
                v.cashOn,
                v.reason,
                v.reference,
                s.userId,
                v.requestKey,
                hash,
                v.method ?? null,
              ],
            )
          ).rows[0];
          await db.query(
            "update gym.members set version=version+1,updated_by=$3,updated_at=now() where organization_id=$1 and id=$2",
            [s.organizationId, inv.member_id, s.userId],
          );
          await audit(db, s, "finance." + v.kind, row.id, v.reason, null, {
            invoiceId: v.invoiceId,
            paymentId: v.paymentId,
            amountMinor: v.amountMinor,
            currency: v.currency,
            number,
            balanceAfterMinor: row.balance,
          });
          return {
            correctionId: row.id,
            number,
            balanceAfterMinor: row.balance,
            requestId: s.requestId,
          };
        },
      );
    },
  };
}
