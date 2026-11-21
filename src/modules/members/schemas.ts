import { z } from "zod";
export function normalizePhone(phone: string) {
  return phone.replace(/[^0-9]/g, "");
}
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) => !/[\u0000-\u001f\u007f]/.test(v),
      "Use a single line of text",
    );
export const memberFields = z
  .object({
    name: text(100).min(1),
    phone: text(40).refine(
      (v) =>
        !v ||
        (/^\+?[0-9() .-]+$/.test(v) && /^[0-9]{7,15}$/.test(normalizePhone(v))),
      "Enter a phone number with 7–15 digits",
    ),
    email: text(254)
      .toLowerCase()
      .refine(
        (v) => !v || z.email().safeParse(v).success,
        "Enter a valid email",
      ),
    homeBranchId: z.uuid(),
    joinedOn: z.iso
      .date()
      .refine((v) => v >= "1900-01-01", "Check the joining date"),
  })
  .strict();
const contact = (v: { phone: string; email: string }) =>
  Boolean(v.phone || v.email);
const duplicate = {
  acknowledgeDuplicate: z.boolean().default(false),
  duplicateReason: text(300).default(""),
};
export const createMember = memberFields
  .extend({ organizationId: z.uuid(), registrationKey: z.uuid(), ...duplicate })
  .strict()
  .refine(contact, "Add a usable phone number or email")
  .refine(
    (v) => !v.acknowledgeDuplicate || v.duplicateReason.length >= 3,
    "Explain why the contact is shared",
  );
export const updateMember = memberFields
  .extend({
    organizationId: z.uuid(),
    id: z.uuid(),
    version: z.number().int().min(1).max(2147483646),
    reason: text(300).min(3),
    ...duplicate,
  })
  .strict()
  .refine(contact, "Add a usable phone number or email")
  .refine(
    (v) => !v.acknowledgeDuplicate || v.duplicateReason.length >= 3,
    "Explain why the contact is shared",
  );
export const listMembers = z
  .object({
    organizationId: z.uuid().optional(),
    branchId: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.uuid().optional(),
    ),
    q: text(100).default(""),
    status: z.enum(["registered", "archived", "all"]).default("registered"),
    sort: z.enum(["name", "newest", "oldest", "code"]).default("name"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export type MemberValues = z.infer<typeof memberFields>;
export type DirectoryQuery = z.infer<typeof listMembers>;
export function localToday(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
