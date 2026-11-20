import { randomUUID } from "node:crypto";
import { getSecurity } from "@/server/security";
import { accessFailure } from "@/server/security/http";
export async function GET(request: Request) {
  try {
    const selection = Object.fromEntries(new URL(request.url).searchParams);
    const data = await getSecurity().workspace(request.headers, selection);
    return Response.json(
      { ok: true, data, requestId: randomUUID() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return accessFailure(error);
  }
}
