import { getAttendance } from "@/modules/attendance";
import { success, failure } from "@/server/http";
export async function GET(request: Request) {
  try {
    return success(
      await getAttendance().lookup(
        request.headers,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
