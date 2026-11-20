import { z } from "zod";
const schema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url(),
  DEMO_MODE: z.enum(["true", "false"]).transform((v) => v === "true"),
  DATABASE_URL: z.url().refine((v) => v.startsWith("postgresql://")),
  BETTER_AUTH_SECRET: z.string().min(32),
});
export function readEnvironment(source: Record<string, string | undefined>) {
  const result = schema.safeParse(source);
  if (!result.success)
    throw new Error(
      "Invalid server configuration: " +
        result.error.issues.map((i) => i.path.join(".")).join(", "),
    );
  if (
    (result.data.APP_ENV === "production" ||
      source.NODE_ENV === "production") &&
    result.data.DEMO_MODE
  )
    throw new Error("Demo mode is forbidden in production");
  return result.data;
}
