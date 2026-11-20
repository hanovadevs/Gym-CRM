import { getSettings } from "@/modules/settings";
import { mutationBody, success, failure } from "@/modules/settings/http";
export async function POST(request: Request) {
  try {
    return success(
      await getSettings().staffCreate(
        request.headers,
        await mutationBody(request),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    return success(
      await getSettings().staffSave(
        request.headers,
        await mutationBody(request),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
