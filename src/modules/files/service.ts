import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { createSecurity } from "@/server/security/service";
import { parse } from "@/modules/members/service";
import { BusinessError } from "@/server/errors";
import { audit } from "@/server/audit";
import { receiptImage } from "./validation";
import { postgresPrivateStorage, type PrivateStorage } from "./storage";
const uploadInput = z
  .object({
    organizationId: z.uuid(),
    branchId: z.uuid(),
    requestKey: z.uuid(),
    filename: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .refine((v) => !/[\u0000-\u001f\u007f]/.test(v)),
    contentType: z.enum(["image/png", "image/jpeg"]),
  })
  .strict();
export function createFilesService(
  security: ReturnType<typeof createSecurity>,
  storage: PrivateStorage = postgresPrivateStorage,
) {
  async function upload(headers: Headers, raw: unknown, bytes: Buffer) {
    const input = parse(uploadInput, raw);
    return security.run(
      headers,
      { organizationId: input.organizationId, branchId: input.branchId },
      "expenses.manage",
      async (db, scope) => {
        const requestHash = createHash("sha256")
          .update(JSON.stringify(input))
          .update(bytes)
          .digest("hex");
        await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `file:${scope.organizationId}:${scope.userId}:${input.requestKey}`,
        ]);
        const prior = (
          await db.query(
            'select id,branch_id,filename,content_type as "contentType",size_bytes as "sizeBytes",request_hash from gym.private_files where organization_id=$1 and uploaded_by=$2 and request_key=$3',
            [scope.organizationId, scope.userId, input.requestKey],
          )
        ).rows[0];
        if (prior) {
          if (prior.request_hash !== requestHash)
            throw new BusinessError(
              "CONFLICT",
              "This upload request already contains another receipt.",
            );
          return {
            id: prior.id,
            filename: prior.filename,
            contentType: prior.contentType,
            sizeBytes: prior.sizeBytes,
            requestId: scope.requestId,
          };
        }
        const image = await receiptImage(
          bytes,
          input.contentType,
          input.filename,
        );
        const result = await storage.put(db, {
          ...image,
          organizationId: scope.organizationId,
          branchId: input.branchId,
          sizeBytes: image.content.length,
          sha256: createHash("sha256").update(image.content).digest("hex"),
          uploadedBy: scope.userId,
          requestKey: input.requestKey,
          requestHash,
        });
        await audit(
          db,
          scope,
          "file.receipt_uploaded",
          result.id,
          "Private expense receipt uploaded",
          null,
          {
            branchId: input.branchId,
            contentType: image.contentType,
            sizeBytes: image.content.length,
          },
        );
        return {
          ...result,
          filename: image.filename,
          contentType: image.contentType,
          sizeBytes: image.content.length,
          requestId: scope.requestId,
        };
      },
    );
  }
  async function download(headers: Headers, id: string, raw: unknown) {
    parse(z.uuid(), id);
    const input = parse(z.object({ organizationId: z.uuid() }).strict(), raw);
    return security.run(
      headers,
      input,
      "expenses.manage",
      async (db, scope) => {
        const linked = (
          await db.query(
            "select id from gym.expenses where organization_id=$1 and file_id=$2 and branch_id=any($3::uuid[])",
            [scope.organizationId, id, [...scope.branchIds]],
          )
        ).rows[0];
        if (!linked)
          throw new BusinessError(
            "NOT_FOUND",
            "Receipt not found in your expense scope.",
          );
        const file = await storage.get(db, scope.organizationId, id);
        if (!file) throw new BusinessError("NOT_FOUND", "Receipt unavailable.");
        if (
          createHash("sha256").update(file.content).digest("hex") !==
          file.sha256
        )
          throw new BusinessError(
            "CONFLICT",
            "The saved receipt could not be verified. Contact your gym administrator.",
          );
        await audit(
          db,
          scope,
          "file.receipt_downloaded",
          id,
          "Private expense receipt downloaded",
          null,
          { expenseId: linked.id },
        );
        return { file, requestId: scope.requestId };
      },
    );
  }
  return { upload, download };
}
