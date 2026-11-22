import { z } from "zod";
import { calendarDate } from "@/modules/memberships/schemas";
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), "Use one line of text");
const page = z.coerce.number().int().min(1).max(100000).default(1),
  version = z.number().int().min(1).max(2147483646),
  base = {
    organizationId: z.uuid(),
    requestKey: z.uuid(),
    reason: text(300).min(3),
  };
export const classQuery = z
  .object({
    organizationId: z.uuid().optional(),
    branchId: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.uuid().optional(),
    ),
    trainerId: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.uuid().optional(),
    ),
    classId: z.uuid().optional(),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    mode: z.enum(["week", "day", "list"]).default("week"),
    page,
    rosterPage: page,
    availabilityPage: page,
  })
  .strict();
export const classMutation = z.discriminatedUnion("operation", [
  z
    .object({
      ...base,
      operation: z.literal("room"),
      id: z.uuid(),
      version: version.optional(),
      branchId: z.uuid(),
      name: text(80).min(1),
      capacity: z.number().int().min(1).max(500),
      active: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("availability"),
      id: z.uuid(),
      version: version.optional(),
      trainerId: z.uuid(),
      branchId: z.uuid(),
      weekday: z.number().int().min(0).max(6),
      startMinute: z.number().int().min(0).max(1439),
      endMinute: z.number().int().min(1).max(1440),
      active: z.boolean(),
    })
    .strict()
    .refine(
      (v) => v.endMinute > v.startMinute,
      "End time must follow start time",
    ),
  z
    .object({
      ...base,
      operation: z.literal("session"),
      id: z.uuid(),
      version: version.optional(),
      branchId: z.uuid(),
      trainerId: z.uuid(),
      roomId: z.uuid().nullable(),
      title: text(120).min(3),
      startsAt: z.iso.datetime({ offset: true }),
      endsAt: z.iso.datetime({ offset: true }),
      capacity: z.number().int().min(1).max(500),
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("cancel_session"),
      classId: z.uuid(),
      version,
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("book"),
      classId: z.uuid(),
      memberId: z.uuid(),
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("cancel_booking"),
      classId: z.uuid(),
      bookingId: z.uuid(),
      version,
    })
    .strict(),
]);
export const memberQuery = z
  .object({ organizationId: z.uuid(), classId: z.uuid(), q: text(100).min(2) })
  .strict();
