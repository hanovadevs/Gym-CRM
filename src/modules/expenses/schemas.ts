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
const optionalId = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.uuid().optional(),
);
const optionalDate = z.preprocess(
  (v) => (v === "" ? undefined : v),
  calendarDate.optional(),
);
export const expenseQuery = z
  .object({
    organizationId: z.uuid().optional(),
    branchId: optionalId,
    categoryId: optionalId,
    from: optionalDate,
    to: optionalDate,
    q: text(100).default(""),
    kind: z.enum(["all", "expense", "reversal"]).default("all"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const expenseInput = z
  .object({
    organizationId: z.uuid(),
    branchId: z.uuid(),
    categoryId: z.uuid(),
    requestKey: z.uuid(),
    description: text(300).min(3),
    payee: text(120).default(""),
    amountMinor: z.string().regex(/^[1-9][0-9]{0,11}$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
    paidOn: calendarDate,
    method: z.enum(["cash", "bank_transfer", "other"]),
    reference: text(100).default(""),
    fileId: z.uuid().optional(),
    replacesExpenseId: z.uuid().optional(),
  })
  .strict()
  .refine(
    (v) => v.method !== "bank_transfer" || v.reference.length >= 3,
    "Add a bank transfer reference of at least 3 characters",
  );
export const reversalInput = z
  .object({
    organizationId: z.uuid(),
    expenseId: z.uuid(),
    requestKey: z.uuid(),
    cashOn: calendarDate,
    reason: text(300).min(3),
  })
  .strict();
export const categoryInput = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("create"),
      organizationId: z.uuid(),
      id: z.uuid(),
      name: text(80).min(1),
      reason: text(300).min(3),
    })
    .strict(),
  z
    .object({
      operation: z.literal("update"),
      organizationId: z.uuid(),
      id: z.uuid(),
      name: text(80).min(1),
      active: z.boolean(),
      version: z.number().int().min(1).max(2147483646),
      reason: text(300).min(3),
    })
    .strict(),
]);
