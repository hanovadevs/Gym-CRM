import { getPayments } from "@/modules/payments";
import { success, failure } from "@/server/http";
export async function GET(r: Request) {
  try {
    return success(
      await getPayments().targets(
        r.headers,
        Object.fromEntries(new URL(r.url).searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
