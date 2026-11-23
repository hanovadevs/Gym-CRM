import { z } from "zod";
import { calendarDate } from "@/modules/memberships/schemas";
const line = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), "Use one line of text");
const version = z.number().int().min(1).max(2147483646),
  page = z.coerce.number().int().min(1).max(100000).default(1);
export const agendaQuery = z
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
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    q: line(100).default(""),
    page,
    assignmentPage: page,
  })
  .strict();
const base = {
  organizationId: z.uuid(),
  id: z.uuid(),
  version: version.optional(),
  requestKey: z.uuid(),
  reason: line(300).min(3),
};
export const ptMutation = z.discriminatedUnion("operation", [
  z
    .object({
      ...base,
      operation: z.literal("assignment"),
      trainerId: z.uuid(),
      branchId: z.uuid(),
      memberId: z.uuid(),
      startOn: calendarDate,
      endOn: calendarDate.nullable().default(null),
      active: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("session"),
      assignmentId: z.uuid(),
      roomId: z.uuid().nullable().default(null),
      title: line(120).min(3),
      startsAt: z.iso.datetime({ offset: true }),
      endsAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      organizationId: z.uuid(),
      operation: z.literal("cancel"),
      id: z.uuid(),
      version,
      requestKey: z.uuid(),
      reason: line(300).min(3),
    })
    .strict(),
]);
export const memberQuery = z
  .object({
    organizationId: z.uuid(),
    branchId: z.uuid(),
    trainerId: z.uuid(),
    q: line(100).default(""),
  })
  .strict();
