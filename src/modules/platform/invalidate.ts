"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getPlatform } from ".";
import { AccessError } from "@/server/security/errors";
/** Notify Next's client cache after an already committed platform mutation. */
export async function invalidatePlatformDirectory() {
  if (!(await getPlatform().available(await headers())))
    throw new AccessError("FORBIDDEN");
  revalidatePath("/admin");
}
