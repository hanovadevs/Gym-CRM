import { z } from "zod";
import { memberFields } from "./schemas";
const base = { organizationId: z.uuid(), id: z.uuid() };
const reason = z
  .string()
  .trim()
  .min(3)
  .max(300)
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v));
const version = z.number().int().min(1).max(2147483646);
export const profileQuery = z
  .object({
    organizationId: z.uuid().optional(),
    branchId: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.uuid().optional(),
    ),
    notesPage: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const emergencyContact = z
  .object({
    name: memberFields.shape.name,
    phone: memberFields.shape.phone.refine(
      Boolean,
      "A contact phone is required",
    ),
    relationship: z
      .string()
      .trim()
      .max(80)
      .refine((v) => !/[\u0000-\u001f\u007f]/.test(v)),
  })
  .strict();
export const saveEmergency = z
  .object({ ...base, version, reason, contact: emergencyContact.nullable() })
  .strict();
export const archiveMember = z
  .object({ ...base, version, reason, archived: z.boolean() })
  .strict();
export const addNote = z
  .object({
    ...base,
    requestKey: z.uuid(),
    visibility: z.enum(["operational", "management"]),
    body: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .refine(
        (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),
        "Unsupported control character",
      ),
  })
  .strict();
export const withdrawNote = z
  .object({ ...base, noteId: z.uuid(), reason })
  .strict();
