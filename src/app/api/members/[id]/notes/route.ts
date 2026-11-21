import { getProfiles } from "@/modules/members/profile";
import { success, failure, mutationBody } from "@/server/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return success(
      await getProfiles().note(request.headers, {
        ...(await mutationBody(request)),
        id: (await params).id,
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return success(
      await getProfiles().withdraw(request.headers, {
        ...(await mutationBody(request)),
        id: (await params).id,
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
