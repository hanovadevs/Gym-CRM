import { z } from "zod";
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return (
      Number.isFinite(d.getTime()) &&
      d.toISOString().slice(0, 10) === v &&
      v >= "0001-01-01"
    );
  }, "Choose a valid calendar date");
const version = z.number().int().min(1).max(2147483646),
  reason = z
    .string()
    .trim()
    .min(3)
    .max(300)
    .refine(
      (s) => !/[\u0000-\u001f\u007f]/.test(s),
      "Use a single line of text",
    );
export const querySchema = z
  .object({
    organizationId: z.uuid(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    planQuery: z.string().trim().max(100).default(""),
  })
  .strict();
export const enrollmentFields = z
  .object({
    organizationId: z.uuid(),
    memberVersion: version,
    mode: z.enum(["enroll", "renew"]),
    planVersionId: z.uuid(),
    startOn: calendarDate.optional(),
    useCatalogPrice: z.boolean().optional(),
    monthlyFee: z
      .object({
        amountMinor: z.string().regex(/^(0|[1-9][0-9]{0,11})$/),
        reminderDays: z.number().int().min(1).max(30),
      })
      .strict()
      .optional(),
  })
  .strict();
export const enrollmentSchema = enrollmentFields
  .extend({ requestKey: z.uuid(), reason })
  .strict();
const common = {
  organizationId: z.uuid(),
  memberVersion: version,
  membershipId: z.uuid(),
  version,
  requestKey: z.uuid(),
  reason,
};
export const lifecycleSchema = z.discriminatedUnion("operation", [
  z.object({ ...common, operation: z.literal("activate") }).strict(),
  z
    .object({
      ...common,
      operation: z.literal("freeze"),
      startOn: calendarDate,
      endOn: calendarDate,
    })
    .strict(),
  z
    .object({
      ...common,
      operation: z.literal("reverse_freeze"),
      freezeId: z.uuid(),
    })
    .strict(),
  z
    .object({
      ...common,
      operation: z.literal("cancel"),
      effectiveOn: calendarDate,
    })
    .strict(),
]);
