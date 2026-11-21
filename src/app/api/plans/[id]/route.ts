import { getPlans } from "@/modules/plans";
import { success, failure } from "@/server/http";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return success(
      await getPlans().history(
        r.headers,
        (await params).id,
        Object.fromEntries(new URL(r.url).searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
