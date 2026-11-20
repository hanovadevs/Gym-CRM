import "server-only";
import { getSecurity } from "@/server/security";
import { configureAuth } from "@/server/auth/configure";
import { readEnvironment } from "@/lib/env";
import { createSettingsService } from "./service";
export function getSettings() {
  return createSettingsService(getSecurity(), async (db, input) => {
    const env = readEnvironment(process.env);
    const auth = configureAuth(db, {
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.APP_URL,
      allowProvisioning: true,
      sendReset: async () => {
        throw new Error("Use the normal recovery route");
      },
    });
    const result = await auth.api.signUpEmail({ body: input });
    return { id: result.user.id };
  });
}
