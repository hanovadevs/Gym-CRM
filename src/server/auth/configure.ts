import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, Client } from "pg";
import * as schema from "../db/auth-schema";
export function configureAuth(
  connection: Pool | Client,
  options: {
    secret: string;
    baseURL: string;
    allowProvisioning?: boolean;
    sendReset: (message: { email: string; url: string }) => Promise<void>;
  },
) {
  return betterAuth({
    appName: "Jym CRM",
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: [new URL(options.baseURL).origin],
    database: drizzleAdapter(drizzle(connection, { schema }), {
      provider: "pg",
      schema,
      schemaName: "app_auth",
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !options.allowProvisioning,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 1800,
      sendResetPassword: async ({ user, url }) =>
        options.sendReset({ email: user.email, url }),
    },
    verification: { storeIdentifier: "hashed" },
    session: {
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 30,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
      },
    },
  });
}
