import { getFiles } from "@/modules/files";
import { MAX_RECEIPT_BYTES } from "@/modules/files/validation";
import {
  boundedBody,
  requireMutationOrigin,
  success,
  failure,
} from "@/server/http";
export async function POST(request: Request) {
  try {
    requireMutationOrigin(request);
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const bytes = await boundedBody(
      request,
      MAX_RECEIPT_BYTES,
      "Receipt image must be at most 2MB.",
    );
    return success(
      await getFiles().upload(
        request.headers,
        {
          ...query,
          contentType: request.headers.get("content-type")?.split(";")[0],
        },
        bytes,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
