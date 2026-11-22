import { getPlatform } from "@/modules/platform";
import { success, failure, mutationBody } from "@/server/http";
export async function GET(request: Request) {
  try {
    return success(
      await getPlatform().billing(
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
      await getPlatform().bill(request.headers, await mutationBody(request)),
    );
  } catch (error) {
    return failure(error);
  }
}
