import { getPlans } from "@/modules/plans";
import { success, failure, mutationBody } from "@/server/http";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return success(
      await getPlans().archive(r.headers, {
        ...(await mutationBody(r)),
        id: (await params).id,
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
