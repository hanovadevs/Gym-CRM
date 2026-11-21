import { getProfiles } from "@/modules/members/profile";
import { success, failure, mutationBody } from "@/server/http";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return success(
      await getProfiles().contact(request.headers, {
        ...(await mutationBody(request)),
        id: (await params).id,
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
