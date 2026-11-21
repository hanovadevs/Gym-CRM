import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPlans } from "@/modules/plans";
import { PlansScreen } from "@/modules/plans/plans-screen";
import { AccessError } from "@/server/security/errors";
import { BusinessError } from "@/server/errors";
import { SignOut } from "@/components/sign-out";
export const dynamic = "force-dynamic";
export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let initial;
  try {
    initial = await getPlans().list(await headers(), await searchParams);
  } catch (e) {
    if (e instanceof AccessError || e instanceof BusinessError) {
      if (e.code === "UNAUTHENTICATED") redirect("/sign-in");
      return (
        <main className="setup access-state">
          <h1>
            {e.code === "VALIDATION_ERROR"
              ? "Check your plan filters"
              : "Plans unavailable"}
          </h1>
          <p>{e.message}</p>
          <Link className="text-action" href="/workspace">
            Return to workspace
          </Link>
          <SignOut />
        </main>
      );
    }
    throw e;
  }
  return <PlansScreen initial={initial} />;
}
