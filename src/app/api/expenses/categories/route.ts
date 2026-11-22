import { getExpenses } from "@/modules/expenses";
import { success, failure, mutationBody } from "@/server/http";
export async function POST(request: Request) {
  try {
    return success(
      await getExpenses().category(
        request.headers,
        await mutationBody(request),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
