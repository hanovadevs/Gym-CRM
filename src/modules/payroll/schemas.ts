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
const money = z.string().regex(/^[1-9][0-9]{0,11}$/),
  currency = z.string().regex(/^[A-Z]{3}$/),
  base = {
    organizationId: z.uuid(),
    requestKey: z.uuid(),
    reason: text(300).min(3),
  };
export const payrollQuery = z
  .object({
    organizationId: z.uuid().optional(),
    branchId: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.uuid().optional(),
    ),
    q: text(100).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    employeeId: z.uuid().optional(),
    chargeId: z.uuid().optional(),
    chargePage: z.coerce.number().int().min(1).max(100000).default(1),
    paymentPage: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const payrollMutation = z.discriminatedUnion("operation", [
  z
    .object({
      ...base,
      operation: z.literal("employee"),
      id: z.uuid(),
      version: z.number().int().min(1).optional(),
      branchId: z.uuid(),
      trainerId: z.uuid().nullable().default(null),
      name: text(100).min(2),
      title: text(100).min(2),
      phone: text(50).default(""),
      email: z.union([z.email().max(254), z.literal("")]).default(""),
      startOn: calendarDate,
      active: z.boolean(),
      salaryMinor: money.nullable(),
      currency,
      payDay: z.number().int().min(1).max(28),
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("charge"),
      employeeId: z.uuid(),
      period: calendarDate.refine((v) => v.endsWith("-01")),
      dueOn: calendarDate,
      amountMinor: money,
      currency,
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("payment"),
      chargeId: z.uuid(),
      amountMinor: money,
      currency,
      expectedBalanceMinor: money,
      paidOn: calendarDate,
      method: z.enum(["cash", "bank_transfer", "other"]),
      reference: text(120).default(""),
    })
    .strict(),
  z
    .object({ ...base, operation: z.literal("void"), chargeId: z.uuid() })
    .strict(),
]);
