import { getPersonalTraining } from "@/modules/personal-training";
import { success, failure } from "@/server/http";
export async function GET(r: Request) {
  try {
    return success(
      await getPersonalTraining().members(
        r.headers,
        Object.fromEntries(new URL(r.url).searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
