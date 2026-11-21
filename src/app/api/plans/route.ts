import { getPlans } from "@/modules/plans";
import { success, failure, mutationBody } from "@/server/http";
export async function GET(r: Request) {
  try {
    return success(
      await getPlans().list(
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
    return success(await getPlans().create(r.headers, await mutationBody(r)));
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(r: Request) {
  try {
    return success(await getPlans().publish(r.headers, await mutationBody(r)));
  } catch (e) {
    return failure(e);
  }
}
