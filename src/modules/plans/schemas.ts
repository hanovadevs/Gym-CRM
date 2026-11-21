import { z } from "zod";
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
export const versionFields = z
  .object({
    name: text(100),
    amountMinor: z.number().int().min(0).max(999999999999),
    currency: z.string().regex(/^[A-Z]{3}$/),
    durationUnit: z.enum(["months", "days"]),
    durationCount: z.number().int().min(1).max(3650),
    accessMode: z.enum(["home_branch", "all_branches"]),
    gymFloor: z.boolean(),
    classes: z.boolean(),
    personalTraining: z.boolean(),
  })
  .strict()
  .refine(
    (v) => v.durationUnit !== "months" || v.durationCount <= 120,
    "Calendar-month terms cannot exceed 120 months",
  )
  .refine(
    (v) => v.gymFloor || v.classes || v.personalTraining,
    "Include at least one access benefit",
  );
const org = { organizationId: z.uuid() },
  reason = text(300).min(3),
  revision = z.number().int().min(1).max(2147483646);
const fields = { ...org, values: versionFields, requestKey: z.uuid(), reason };
export const createPlan = z
  .object({
    ...fields,
    branchId: z.uuid(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9-]{0,23}$/),
  })
  .strict();
export const publishVersion = z
  .object({ ...fields, id: z.uuid(), revision })
  .strict();
export const archivePlan = z
  .object({ ...org, id: z.uuid(), revision, archived: z.boolean(), reason })
  .strict();
export const listPlans = z
  .object({
    organizationId: z.uuid().optional(),
    branchId: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.uuid().optional(),
    ),
    q: z.string().trim().max(100).default(""),
    status: z.enum(["active", "archived"]).default("active"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const historyQuery = z
  .object({
    ...org,
    versionPage: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export type VersionValues = z.infer<typeof versionFields>;
export type PlanQuery = z.infer<typeof listPlans>;
