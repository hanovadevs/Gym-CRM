import { getExpenses } from "@/modules/expenses";
import { success, failure, mutationBody } from "@/server/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return success(
      await getExpenses().reverse(request.headers, {
        ...(await mutationBody(request)),
        expenseId: (await params).id,
      }),
    );
  } catch (error) {
    return failure(error);
  }
}
