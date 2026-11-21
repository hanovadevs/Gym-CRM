import { getSecurity } from "@/server/security";
import { createDatabase } from "@/server/db";
import { success, failure, mutationBody } from "@/server/http";
import { deliverMail } from "@/server/mail/service";
import { BusinessError } from "@/server/errors";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    const parsed = z
      .object({ organizationId: z.uuid(), mailId: z.uuid() })
      .strict()
      .safeParse(await mutationBody(request));
    if (!parsed.success)
      throw new BusinessError(
        "VALIDATION_ERROR",
        "Check invitation selection.",
      );
    const input = parsed.data;
    const result = await getSecurity().run(
      request.headers,
      { organizationId: input.organizationId },
      "staff.manage",
      async (db, scope) => {
        const row = (
          await db.query(
            "select o.id,o.status from app_auth.mail_outbox o join gym.staff_memberships s on s.auth_user_id=o.auth_user_id and s.organization_id=o.organization_id where o.organization_id=$1 and o.id=$2 and o.kind='invitation' and s.active=true",
            [scope.organizationId, input.mailId],
          )
        ).rows[0];
        if (!row) throw new BusinessError("NOT_FOUND", "Invitation not found.");
        return { ...row, requestId: scope.requestId };
      },
    );
    const { pool } = createDatabase();
    return success({
      ...result,
      deliveryStatus: await deliverMail(pool, result.id, {
        retryFailed: true,
      }),
    });
  } catch (e) {
    return failure(e);
  }
}
