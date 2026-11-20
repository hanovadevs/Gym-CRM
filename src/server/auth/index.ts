import "server-only";
import { Pool } from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { readEnvironment } from "@/lib/env";
import { configureAuth } from "./configure";
let instance: ReturnType<typeof configureAuth> | undefined;
export function getAuth() {
  if (instance) return instance;
  const env = readEnvironment(process.env);
  instance = configureAuth(
    new Pool({ connectionString: env.DATABASE_URL, max: 5 }),
    {
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.APP_URL,
      allowLocalAliases:
        env.APP_ENV !== "production" && process.env.NODE_ENV !== "production",
      sendReset: async (message) => {
        if (
          process.env.NODE_ENV === "production" ||
          env.APP_ENV === "production"
        )
          throw new Error("Recovery mail delivery is not configured");
        await mkdir(".local/mail", { recursive: true });
        await writeFile(
          `.local/mail/${randomUUID()}.json`,
          JSON.stringify({ ...message, createdAt: new Date().toISOString() }),
          { mode: 0o600, flag: "wx" },
        );
      },
    },
  );
  return instance;
}
