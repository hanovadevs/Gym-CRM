import { z } from "zod";
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) => !/[\u0000-\u001f\u007f]/.test(v),
      "Use a single line of text",
    );
export const trainerQuery = z
  .object({
    organizationId: z.uuid().optional(),
    branchId: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.uuid().optional(),
    ),
    q: text(100).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const trainerInput = z
  .object({
    organizationId: z.uuid(),
    id: z.uuid(),
    requestKey: z.uuid(),
    version: z.number().int().min(1).max(2147483646).optional(),
    name: text(100).min(2),
    specialties: text(200).default(""),
    phone: text(50).default(""),
    email: z.union([z.email().max(254), z.literal("")]).default(""),
    loginUserId: z.string().min(1).max(200).nullable().default(null),
    branchIds: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((v) => new Set(v).size === v.length, "Choose each branch once"),
    active: z.boolean().default(true),
    reason: text(300).min(3),
  })
  .strict();
