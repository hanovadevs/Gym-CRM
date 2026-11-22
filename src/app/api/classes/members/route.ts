import { getClasses } from "@/modules/classes";
import { success, failure } from "@/server/http";
export async function GET(r: Request) {
  try {
    return success(
      await getClasses().members(
        r.headers,
        Object.fromEntries(new URL(r.url).searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
