import "server-only";
import { createDatabase } from "@/server/db";
import { getAuth } from "@/server/auth";
import { provisionStaff } from "@/modules/settings";
import { createPlatformService } from "./service";
export function getPlatform() {
  return createPlatformService(
    createDatabase().pool,
    (headers) => getAuth().api.getSession({ headers }),
    provisionStaff,
    process.env.BETTER_AUTH_SECRET!,
  );
}
