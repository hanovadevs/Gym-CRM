import { getAttendance } from "@/modules/attendance";
import { success, failure, mutationBody } from "@/server/http";
export async function GET(request: Request) {
  try {
    return success(
      await getAttendance().get(
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
      await getAttendance().record(
        request.headers,
        await mutationBody(request),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
