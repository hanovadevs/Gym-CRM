import { getReport } from "@/modules/reports/service";
import { success, failure } from "@/server/http";
export async function GET(request: Request) {
  try {
    return success(
      await getReport(
        request.headers,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
