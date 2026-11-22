import { getDashboard } from "@/modules/dashboard";
import { success, failure } from "@/server/http";
export async function GET(request: Request) {
  try {
    return success(
      await getDashboard().get(
        request.headers,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
