import { z } from "zod";
import { roleSchema } from "@/server/security/permissions";
const zone = z
  .string()
  .max(100)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid IANA time zone");
const locale = z
  .string()
  .max(35)
  .refine((v) => {
    try {
      return Intl.DateTimeFormat.supportedLocalesOf([v]).length === 1;
    } catch {
      return false;
    }
  }, "Choose a supported locale");
export const settingsFields = z
  .object({
    name: z.string().trim().min(1).max(100),
    phone: z.string().trim().max(40),
    email: z.union([z.email(), z.literal("")]),
    address: z.string().trim().max(500),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .refine((v) => Intl.supportedValuesOf("currency").includes(v)),
    timeZone: zone,
    locale,
    receiptPrefix: z
      .string()
      .trim()
      .regex(/^[A-Z0-9-]{1,12}$/),
    receiptFooter: z.string().trim().max(240),
    graceDays: z.number().int().min(0).max(30),
    debtBlocksAccess: z.boolean(),
    paidActivation: z.boolean(),
  })
  .strict();
const org = { organizationId: z.uuid() };
const reason = z.string().trim().min(3).max(300);
const version = z.number().int().min(1).max(2147483646);
export const updateSettings = z
  .object({
    ...org,
    version,
    changes: settingsFields.partial().refine((v) => Object.keys(v).length > 0),
    reason,
  })
  .strict();
const access = {
  role: roleSchema,
  active: z.boolean(),
  branchIds: z
    .array(z.uuid())
    .max(100)
    .refine((v) => new Set(v).size === v.length),
};
export const updateStaff = z
  .object({ ...org, id: z.uuid(), version, ...access, reason })
  .strict();
export const createStaff = z
  .object({
    ...org,
    name: z.string().trim().min(1).max(100),
    email: z.email().toLowerCase(),
    password: z.string().min(12).max(128),
    ...access,
    reason,
  })
  .strict();
export const branchWrite = z
  .object({
    ...org,
    id: z.uuid().optional(),
    version: version.optional(),
    name: z.string().trim().min(1).max(100),
    code: z
      .string()
      .trim()
      .regex(/^[A-Z0-9-]{2,16}$/),
    active: z.boolean(),
    reason,
  })
  .strict()
  .refine((v) => Boolean(v.id) === Boolean(v.version));
export type SettingsValues = z.infer<typeof settingsFields>;
export const managerFields = [
  "phone",
  "email",
  "address",
  "receiptFooter",
] as const;

export const settingsQuery = z
  .object({
    organizationId: z.uuid().optional(),
    branchId: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.uuid().optional(),
    ),
    staffPage: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
