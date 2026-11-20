import { getSettings } from "@/modules/settings";
import { mutationBody, success, failure } from "@/modules/settings/http";
export async function POST(request: Request) {
  try {
    return success(
      await getSettings().branchSave(
        request.headers,
        await mutationBody(request),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export const PATCH = POST;
