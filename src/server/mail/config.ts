import { z } from "zod";
export const SYSTEM_SENDER = "contact@hanovadevs.com";
export function mailConfig(source: Record<string, string | undefined>) {
  const mode = source.MAIL_TRANSPORT ?? (source.SMTP_HOST ? "smtp" : "capture");
  const production =
    source.NODE_ENV === "production" || source.APP_ENV === "production";
  if (mode === "capture" && !production) return { mode: "capture" as const };
  const parsed = z
    .object({
      SMTP_HOST: z.string().min(1),
      SMTP_PORT: z.coerce.number().int().min(1).max(65535),
      SMTP_USE_SSL: z.enum(["true", "false"]),
      SMTP_USERNAME: z.literal(SYSTEM_SENDER),
      SMTP_PASSWORD: z.string().min(1),
    })
    .safeParse(source);
  if (mode !== "smtp" || !parsed.success)
    throw new Error("SMTP delivery configuration is missing or invalid");
  const env = parsed.data;
  return {
    mode: "smtp" as const,
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_USE_SSL === "true",
    auth: { user: env.SMTP_USERNAME, pass: env.SMTP_PASSWORD },
  };
}
