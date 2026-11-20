import "server-only";
import { randomUUID } from "node:crypto";
import { AccessError } from "./errors";
export function accessFailure(error: unknown) {
  const requestId = randomUUID();
  if (error instanceof AccessError) {
    const status = {
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      VALIDATION_ERROR: 422,
    }[error.code];
    return Response.json(
      {
        ok: false,
        error: { code: error.code, message: error.message },
        requestId,
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    {
      ok: false,
      error: {
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Your workspace could not be loaded. Please try again.",
      },
      requestId,
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
