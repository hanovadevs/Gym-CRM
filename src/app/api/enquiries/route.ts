import { getEnquiries } from "@/modules/enquiries";
import { success, failure, mutationBody } from "@/server/http";
export async function GET(request: Request) {
  try {
    return success(
      await getEnquiries().get(
        request.headers,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    return success(
      await getEnquiries().post(request.headers, await mutationBody(request)),
    );
  } catch (e) {
    return failure(e);
  }
}
