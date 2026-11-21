import "server-only";
import { getSecurity } from "@/server/security";
import { configureAuth } from "@/server/auth/configure";
import { readEnvironment } from "@/lib/env";
import { createSettingsService } from "./service";
import { enqueueMail } from "@/server/mail/service";
import type { PoolClient } from "pg";
export async function provisionStaff(
  db: PoolClient,
  input: {
    name: string;
    email: string;
    password: string;
    invite?: boolean;
    organizationId?: string;
  },
) {
  const env = readEnvironment(process.env);
  let mailId: string | undefined;
  const auth = configureAuth(db, {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_URL,
    allowProvisioning: true,
    sendReset: async (message) => {
      if (!input.invite || !input.organizationId)
        throw new Error("Use the normal recovery route");
      const user = (
        await db.query('select id from app_auth."user" where email=$1', [
          input.email,
        ])
      ).rows[0];
      const org = (
        await db.query("select name from gym.organizations where id=$1", [
          input.organizationId,
        ])
      ).rows[0];
      mailId = await enqueueMail(db, {
        ...message,
        userId: user.id,
        organizationId: input.organizationId,
        gymName: org.name,
        kind: "invitation",
      });
    },
  });
  const result = await auth.api.signUpEmail({
    body: { name: input.name, email: input.email, password: input.password },
  });
  if (input.invite)
    await auth.api.requestPasswordReset({
      body: {
        email: input.email,
        redirectTo: new URL("/reset-password", env.APP_URL).href,
      },
    });
  if (input.invite && !mailId) throw new Error("Invitation was not queued");
  return { id: result.user.id, mailId };
}
export function getSettings() {
  return createSettingsService(getSecurity(), provisionStaff);
}
