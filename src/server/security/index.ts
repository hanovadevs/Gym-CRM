import "server-only";
import { createDatabase } from "@/server/db";
import { getAuth } from "@/server/auth";
import { createSecurity } from "./service";
let instance: ReturnType<typeof createSecurity> | undefined;
export function getSecurity() {
  if (!instance) {
    const { pool } = createDatabase();
    instance = createSecurity(pool, (headers) =>
      getAuth().api.getSession({ headers }),
    );
  }
  return instance;
}
