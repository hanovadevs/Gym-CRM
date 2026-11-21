import { getPlatform } from "@/modules/platform";
import { failure, success, mutationBody } from "@/server/http";
export async function GET(request: Request) {
  try {
    return success(
      await getPlatform().get(
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
      await getPlatform().save(request.headers, await mutationBody(request)),
    );
  } catch (error) {
    return failure(error);
  }
}
