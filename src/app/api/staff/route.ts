import { getSettings } from "@/modules/settings";
import { mutationBody, success, failure } from "@/modules/settings/http";
import { createDatabase } from "@/server/db";
import { deliverMail } from "@/server/mail/service";
export async function POST(request: Request) {
  try {
    const result = await getSettings().staffCreate(
      request.headers,
      await mutationBody(request),
    );
    if ("mailId" in result && result.mailId) {
      const { pool } = createDatabase();
      try {
        return success({
          ...result,
          deliveryStatus: await deliverMail(pool, result.mailId),
        });
      } catch {
        return success({ ...result, deliveryStatus: "unavailable" });
      } finally {
        await pool.end();
      }
    }
    return success(result);
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    return success(
      await getSettings().staffSave(
        request.headers,
        await mutationBody(request),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
