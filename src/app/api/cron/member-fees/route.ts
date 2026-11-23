import { timingSafeEqual } from "node:crypto";
import { createDatabase } from "@/server/db";
import { runFeeReminderWorker } from "@/modules/member-fees/worker";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET,
    header = request.headers.get("authorization") ?? "";
  const expected = secret ? "Bearer " + secret : "";
  if (
    !secret ||
    secret.length < 32 ||
    secret.startsWith("REPLACE_") ||
    Buffer.byteLength(header) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(header), Buffer.from(expected))
  )
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")
    return Response.json(
      { error: "Scheduled emails are disabled outside production" },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  try {
    return Response.json(await runFeeReminderWorker(createDatabase().pool), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Reminder processing failed. Check the delivery history before retrying.",
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
