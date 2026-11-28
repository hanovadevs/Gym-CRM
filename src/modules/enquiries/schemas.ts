import { z } from "zod";
import { calendarDate } from "@/modules/memberships/schemas";
import { memberFields } from "@/modules/members/schemas";

const line = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) => !/[\u0000-\u001f\u007f]/.test(value),
      "Use one line of text",
    );
export const stages = [
  "new",
  "contacted",
  "trial_booked",
  "joined",
  "lost",
] as const;
export const enquiryQuery = z
  .object({
    organizationId: z.uuid().optional(),
    branchId: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.uuid().optional(),
    ),
    stage: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.enum(stages).optional(),
    ),
    selectedId: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.uuid().optional(),
    ),
    view: z.enum(["pipeline", "list"]).default("pipeline"),
    taskPage: z.coerce.number().int().min(1).max(100000).default(1),
    taskStatus: z.enum(["open", "done", "all"]).default("open"),
    q: line(100).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
const base = {
  organizationId: z.uuid(),
  id: z.uuid(),
  requestKey: z.uuid(),
  reason: line(300).min(3),
};
const details = {
  name: memberFields.shape.name,
  phone: memberFields.shape.phone.default(""),
  email: z.union([z.email().max(254), z.literal("")]).default(""),
  interest: line(300).default(""),
  contactAllowed: z.boolean(),
  assigneeId: z.uuid().nullable(),
  stage: z.enum(["new", "contacted", "trial_booked", "lost"]),
  trialAt: z.iso.datetime({ offset: true }).nullable(),
};
export const enquiryMutation = z.discriminatedUnion("operation", [
  z
    .object({
      ...base,
      ...details,
      operation: z.literal("create"),
      branchId: z.uuid(),
    })
    .strict(),
  z
    .object({
      ...base,
      ...details,
      operation: z.literal("edit"),
      version: z.number().int().min(1).max(2147483646),
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("task"),
      action: line(300).min(3),
      dueOn: calendarDate,
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("complete_task"),
      taskId: z.uuid(),
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("convert"),
      version: z.number().int().positive(),
      joinedOn: calendarDate,
      enrollment: z.discriminatedUnion("mode", [
        z.object({ mode: z.literal("later") }).strict(),
        z
          .object({
            mode: z.literal("enroll"),
            planVersionId: z.uuid(),
            startOn: calendarDate,
          })
          .strict(),
      ]),
      sharedContactReason: line(300).default(""),
    })
    .strict(),
]);
