import { getPayments } from "@/modules/payments";
import { success, failure } from "@/server/http";
export async function GET(r: Request, c: { params: Promise<{ id: string }> }) {
  try {
    return success(
      await getPayments().receipt(
        r.headers,
        (await c.params).id,
        Object.fromEntries(new URL(r.url).searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
