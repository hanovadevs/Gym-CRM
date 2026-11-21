import { z } from "zod";
import { calendarDate } from "@/modules/memberships/schemas";
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (v) => !/[\u0000-\u001f\u007f]/.test(v),
      "Use a single line of text",
    );
export const lineSchema = z
  .object({
    description: text(150),
    quantity: z.number().int().min(1).max(10000),
    unitMinor: z.number().int().min(0).max(999999999999),
    discountMinor: z.number().int().min(0).max(999999999999),
  })
  .strict();
export const draftFields = z
  .object({
    description: text(100),
    dueOn: calendarDate,
    currency: z.string().regex(/^[A-Z]{3}$/),
    lines: z.array(lineSchema).min(1).max(30),
  })
  .strict();
const common = {
  organizationId: z.uuid(),
  requestKey: z.uuid(),
  reason: text(300).min(3),
};
export const createInvoice = z
  .object({ ...common, memberId: z.uuid(), values: draftFields })
  .strict();
export const changeInvoice = z.discriminatedUnion("operation", [
  z
    .object({
      ...common,
      operation: z.literal("edit"),
      version: z.number().int().min(1).max(2147483646),
      values: draftFields,
    })
    .strict(),
  z
    .object({
      ...common,
      operation: z.literal("issue"),
      version: z.number().int().min(1).max(2147483646),
    })
    .strict(),
]);
export const invoiceQuery = z
  .object({
    organizationId: z.uuid().optional(),
    branchId: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.uuid().optional(),
    ),
    q: z.string().trim().max(100).default(""),
    status: z
      .enum(["all", "outstanding", "overdue", "draft", "issued"])
      .default("all"),
    memberId: z.uuid().optional(),
    from: z.preprocess(
      (v) => (v === "" ? undefined : v),
      calendarDate.optional(),
    ),
    to: z.preprocess(
      (v) => (v === "" ? undefined : v),
      calendarDate.optional(),
    ),
    sort: z.enum(["newest", "due", "amount"]).default("newest"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict()
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "The end date must be on or after the start date",
  );
export const detailQuery = z.object({ organizationId: z.uuid() }).strict();
export const recipientsQuery = z
  .object({
    organizationId: z.uuid(),
    q: z.string().trim().max(100).default(""),
    branchId: z.uuid().optional(),
  })
  .strict();
export type LineInput = z.infer<typeof lineSchema>;
export type DraftValues = z.infer<typeof draftFields>;
export type InvoiceQuery = z.infer<typeof invoiceQuery>;
