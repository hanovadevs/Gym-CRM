import { getPlatform } from "@/modules/platform";
import { failure, success } from "@/server/http";
export async function GET(request: Request) {
  try {
    return success(
      await getPlatform().analytics(
        request.headers,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
