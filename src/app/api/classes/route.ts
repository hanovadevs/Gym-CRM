import { getClasses } from "@/modules/classes";
import { success, failure, mutationBody } from "@/server/http";
export async function GET(r: Request) {
  try {
    return success(
      await getClasses().get(
        r.headers,
        Object.fromEntries(new URL(r.url).searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    return success(await getClasses().post(r.headers, await mutationBody(r)));
  } catch (e) {
    return failure(e);
  }
}
