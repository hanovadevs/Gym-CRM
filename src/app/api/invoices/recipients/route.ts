import { getBilling } from "@/modules/billing";
import { success, failure } from "@/server/http";
export async function GET(r: Request) {
  try {
    return success(
      await getBilling().recipients(
        r.headers,
        Object.fromEntries(new URL(r.url).searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
