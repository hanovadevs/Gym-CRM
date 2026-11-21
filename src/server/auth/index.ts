import "server-only";
import { Pool } from "pg";
import { enqueueMail, deliverMail } from "@/server/mail/service";
import { readEnvironment } from "@/lib/env";
import { configureAuth } from "./configure";
let instance: ReturnType<typeof configureAuth> | undefined;
export function getAuth() {
  if (instance) return instance;
  const env = readEnvironment(process.env);
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 5 });
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
      const id = await enqueueMail(pool, {
        ...message,
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
