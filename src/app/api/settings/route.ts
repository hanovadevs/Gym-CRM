import { getSettings } from "@/modules/settings";
import { mutationBody, success, failure } from "@/modules/settings/http";
export async function GET(request: Request) {
  try {
    return success(
      await getSettings().get(
        request.headers,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    return success(
      await getSettings().save(request.headers, await mutationBody(request)),
    );
  } catch (error) {
    return failure(error);
  }
}
