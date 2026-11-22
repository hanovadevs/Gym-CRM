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
  console.error("Protected operation failed", {
    requestId,
    code:
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string" &&
      /^[A-Z0-9_]{3,40}$/.test(error.code)
        ? error.code
        : "DEPENDENCY_ERROR",
    category:
      error instanceof Error && /timeout/i.test(error.message)
        ? "timeout"
        : error instanceof Error &&
            error.message === "Unsafe database runtime role"
          ? "runtime_role"
          : "dependency",
  });
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
