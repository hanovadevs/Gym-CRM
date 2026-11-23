"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSecurity } from "@/server/security";
/** Cache notification only: fresh tenant membership, no business write or financial data. */
export async function invalidateMemberFeeViews(organizationId: string) {
  const id = z.uuid().parse(organizationId);
  await getSecurity().run(
    await headers(),
    { organizationId: id },
    "workspace.read",
    async () => null,
  );
  revalidatePath("/dashboard");
  revalidatePath("/workspace");
  revalidatePath("/member-fees");
}
