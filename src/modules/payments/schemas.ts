import { z } from "zod";
import { calendarDate } from "@/modules/memberships/schemas";
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) => !/[\u0000-\u001f\u007f]/.test(v),
      "Use a single line of text",
    );
const positive = z.string().regex(/^[1-9][0-9]{0,11}$/),
  nonnegative = z.string().regex(/^(0|[1-9][0-9]{0,11})$/);
export const recordPayment = z
  .object({
    organizationId: z.uuid(),
    invoiceId: z.uuid(),
    requestKey: z.uuid(),
    amountMinor: positive,
    expectedBalanceMinor: positive,
    currency: z.string().regex(/^[A-Z]{3}$/),
    method: z.enum(["cash", "bank_transfer", "other"]),
    paidOn: calendarDate,
    reference: text(100).default(""),
    note: text(300).default(""),
  })
  .strict()
  .refine(
    (v) => v.method !== "bank_transfer" || v.reference.length >= 3,
    "Add the bank transfer reference (at least 3 characters)",
  );
export const paymentQuery = z
  .object({
    organizationId: z.uuid().optional(),
    branchId: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.uuid().optional(),
    ),
    memberId: z.uuid().optional(),
    invoiceId: z.uuid().optional(),
    q: text(100).default(""),
    method: z.enum(["all", "cash", "bank_transfer", "other"]).default("all"),
    from: z.preprocess(
      (v) => (v === "" ? undefined : v),
      calendarDate.optional(),
    ),
    to: z.preprocess(
      (v) => (v === "" ? undefined : v),
      calendarDate.optional(),
    ),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict()
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "The end date must be on or after the start date",
  );
export const receiptQuery = z.object({ organizationId: z.uuid() }).strict();
export const targetsQuery = z
  .object({
    organizationId: z.uuid(),
    branchId: z.uuid().optional(),
    q: text(100).default(""),
  })
  .strict();
export const activationResults = [
  "activated",
  "already_active",
  "partial",
  "not_linked",
  "archived",
  "cancelled",
  "expired",
] as const;
export const receiptSnapshot = z.object({
  issuer: z.object({
    name: z.string(),
    address: z.string(),
    email: z.string(),
    phone: z.string(),
    footer: z.string(),
    locale: z.string(),
    timeZone: z.string(),
  }),
  recipientName: z.string(),
  recipientCode: z.string(),
  branchName: z.string(),
  invoiceNumber: z.string(),
  description: z.string(),
  invoiceTotalMinor: nonnegative,
  currency: z.string(),
});
export type PaymentQuery = z.infer<typeof paymentQuery>;
