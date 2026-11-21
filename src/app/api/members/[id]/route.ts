import { getProfiles } from "@/modules/members/profile";
import { success, failure } from "@/server/http";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return success(
      await getProfiles().get(
        request.headers,
        (await params).id,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
