import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAuth } from "@/server/auth";
import { createDatabase } from "@/server/db";
import { mutationBody, failure } from "@/server/http";
import { readEnvironment } from "@/lib/env";
import { parse } from "@/modules/members/service";
const input = z
  .object({
    email: z.email().trim().toLowerCase().max(254),
    gymLoginEmail: z
      .union([z.email().trim().toLowerCase().max(254), z.literal("")])
      .optional(),
  })
  .strict();
export async function POST(request: Request) {
  try {
    const v = parse(input, await mutationBody(request)),
      { pool } = createDatabase();
    const resolved = (
      await pool.query("select gym.recovery_account_identifier($1,$2) email", [
        v.email,
        v.gymLoginEmail || null,
      ])
    ).rows[0].email;
    const env = readEnvironment(process.env),
      headers = new Headers(request.headers);
    headers.delete("content-length");
    headers.set("content-type", "application/json");
    // Delegate token generation, neutral responses and HTTP rate limits to maintained Better Auth.
    const response = await getAuth().handler(
      new Request(new URL("/api/auth/request-password-reset", env.APP_URL), {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: resolved ?? randomUUID() + "@unavailable.invalid",
          redirectTo: new URL("/reset-password", env.APP_URL).href,
        }),
      }),
    );
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    return failure(error);
  }
}
