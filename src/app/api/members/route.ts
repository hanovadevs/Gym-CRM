import { getMembers } from "@/modules/members";
import { success, failure, mutationBody } from "@/server/http";
export async function GET(request: Request) {
  try {
    return success(
      await getMembers().list(
        request.headers,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    return success(
      await getMembers().create(request.headers, await mutationBody(request)),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    return success(
      await getMembers().update(request.headers, await mutationBody(request)),
    );
  } catch (error) {
    return failure(error);
  }
}
