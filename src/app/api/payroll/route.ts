import { getPayroll } from "@/modules/payroll";
import { success, failure, mutationBody } from "@/server/http";
export async function GET(r: Request) {
  try {
    return success(
      await getPayroll().get(
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
    return success(await getPayroll().post(r.headers, await mutationBody(r)));
  } catch (e) {
    return failure(e);
  }
}
