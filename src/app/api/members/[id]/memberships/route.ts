import { getMemberships } from "@/modules/memberships";
import { success, failure, mutationBody } from "@/server/http";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return success(
      await getMemberships().get(
        r.headers,
        (await params).id,
        Object.fromEntries(new URL(r.url).searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return success(
      await getMemberships().enroll(
        r.headers,
        (await params).id,
        await mutationBody(r),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return success(
      await getMemberships().change(
        r.headers,
        (await params).id,
        await mutationBody(r),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
