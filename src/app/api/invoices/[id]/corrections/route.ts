import { getSecurity } from "@/server/security";
import { createCorrectionsService } from "@/modules/billing/corrections";
import { failure, mutationBody, success } from "@/server/http";
import { BusinessError } from "@/server/errors";
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  try {
    const body = await mutationBody(r),
      { id } = await c.params;
    if (!body || body.invoiceId !== id)
      throw new BusinessError(
        "VALIDATION_ERROR",
        "Choose the invoice being corrected.",
      );
    return success(
      await createCorrectionsService(getSecurity()).record(r.headers, body),
    );
  } catch (e) {
    return failure(e);
  }
}
