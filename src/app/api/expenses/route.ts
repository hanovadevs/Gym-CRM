import { getExpenses } from "@/modules/expenses";
import { success, failure, mutationBody } from "@/server/http";
export async function GET(request: Request) {
  try {
    return success(
      await getExpenses().get(
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
      await getExpenses().post(request.headers, await mutationBody(request)),
    );
  } catch (error) {
    return failure(error);
  }
}
