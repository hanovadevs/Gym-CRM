import { getMemberships } from "@/modules/memberships";
import { success, failure, mutationBody } from "@/server/http";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return success(
      await getMemberships().preview(
        r.headers,
        (await params).id,
        await mutationBody(r),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
