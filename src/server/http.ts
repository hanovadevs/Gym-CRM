import "server-only";
import { randomUUID } from "node:crypto";
import { readEnvironment } from "@/lib/env";
import { AccessError } from "@/server/security/errors";
import { accessFailure } from "@/server/security/http";
import { BusinessError } from "./errors";
import { trustedOrigins } from "@/lib/origins";
export async function mutationBody(request: Request) {
  const env = readEnvironment(process.env);
  if (
    !trustedOrigins(
      env.APP_URL,
      env.APP_ENV !== "production" && process.env.NODE_ENV !== "production",
    ).includes(request.headers.get("origin") ?? "") ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new AccessError("FORBIDDEN");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new BusinessError("VALIDATION_ERROR", "Send JSON form data.");
  if (Number(request.headers.get("content-length") ?? 0) > 32768)
    throw new BusinessError("VALIDATION_ERROR", "Form data is too large.");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        throw new BusinessError("VALIDATION_ERROR", "Form data is too large.");
      }
      chunks.push(value);
    }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new BusinessError("VALIDATION_ERROR", "Invalid form data.");
  }
}
export function success<T extends { requestId: string }>(result: T) {
  const { requestId, ...data } = result;
  return Response.json(
    { ok: true, data, requestId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export function failure(error: unknown) {
  if (error instanceof BusinessError)
    return Response.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        requestId: randomUUID(),
      },
      {
        status: {
          CONFLICT: 409,
          VALIDATION_ERROR: 422,
          NOT_FOUND: 404,
          FORBIDDEN: 403,
          ACCESS_DENIED: 403,
        }[error.code],
        headers: { "Cache-Control": "no-store" },
      },
    );
  return accessFailure(error);
}
