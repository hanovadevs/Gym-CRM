import { z } from "zod";
import type { Client } from "pg";
import { configureAuth } from "../auth/configure";

const schema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.email().toLowerCase(),
    password: z.string().min(12).max(128),
  })
  .strict();
/** Operator-only provisioning. Never imported by a route or tenant service. */
export async function bootstrapPlatformAdmin(
  client: Client,
  raw: unknown,
  options: { secret: string; baseURL: string },
) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw Error(
      "Platform administrator requires a name, valid email and password of at least 12 characters",
    );
  const data = parsed.data;
  await client.query("begin");
  try {
    await client.query(
      "select pg_advisory_xact_lock(hashtextextended('mojym-platform-bootstrap',0))",
    );
    const existing = (
      await client.query(
        'select u.id,a.active from app_auth."user" u left join platform.administrators a on a.user_id=u.id where lower(u.email)=$1',
        [data.email],
      )
    ).rows[0];
    if (existing) {
      if (existing.active !== true)
        throw Error(
          "Existing account requires explicit grant review; no password or access changed",
        );
      await client.query("commit");
      return { created: false, userId: existing.id };
    }
    const auth = configureAuth(client, {
      ...options,
      allowProvisioning: true,
      sendReset: async () => {
        throw Error("Bootstrap cannot send email");
      },
    });
    const result = await auth.api.signUpEmail({ body: data });
    await client.query(
      "insert into platform.administrators(user_id,reason) values($1,$2)",
      [
        result.user.id,
        "Explicit platform administrator setup requested by product owner",
      ],
    );
    await client.query("commit");
    return { created: true, userId: result.user.id };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
