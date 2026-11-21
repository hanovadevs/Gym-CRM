import { getBilling } from "@/modules/billing";
import { success, failure, mutationBody } from "@/server/http";
export async function GET(r: Request, c: { params: Promise<{ id: string }> }) {
  try {
    return success(
      await getBilling().get(
        r.headers,
        (await c.params).id,
        Object.fromEntries(new URL(r.url).searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(
  r: Request,
  c: { params: Promise<{ id: string }> },
) {
  try {
    return success(
      await getBilling().change(
        r.headers,
        (await c.params).id,
        await mutationBody(r),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
