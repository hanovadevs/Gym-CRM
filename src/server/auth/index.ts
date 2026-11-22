import "server-only";
import { createDatabase } from "@/server/db";
import { enqueueMail, deliverMail } from "@/server/mail/service";
import { readEnvironment } from "@/lib/env";
import { accountMailTarget } from "./account-contact";
import { configureAuth } from "./configure";
let instance: ReturnType<typeof configureAuth> | undefined;
export function getAuth() {
  if (instance) return instance;
  const env = readEnvironment(process.env);
  const { pool } = createDatabase();
  instance = configureAuth(pool, {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_URL,
    allowLocalAliases:
      env.APP_ENV !== "production" && process.env.NODE_ENV !== "production",
    sendReset: async (message) => {
      const user = (
        await pool.query('select id from app_auth."user" where email=$1', [
          message.email,
        ])
      ).rows[0];
      const target = await accountMailTarget(pool, user.id);
      if (!target?.recipient_email) {
        console.warn("Account recovery requires an owner contact", {
          userId: user.id,
        });
        return;
      }
      const id = await enqueueMail(pool, {
        ...message,
        email: target.recipient_email,
        ...(target.organization_id
          ? { organizationId: target.organization_id }
          : {}),
        userId: user.id,
        kind: "recovery",
      });
      const status = await deliverMail(pool, id);
      if (status !== "sent")
        console.error("Account mail delivery requires attention", {
          id,
          status,
        });
    },
  });
  return instance;
}
