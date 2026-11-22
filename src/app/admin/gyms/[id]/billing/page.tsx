import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPlatform } from "@/modules/platform";
import { AccessError } from "@/server/security/errors";
import { BusinessError } from "@/server/errors";
import { PlatformBillingScreen } from "@/modules/platform/billing-screen";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params,
    q = await searchParams;
  let data;
  try {
    data = await getPlatform().billing(await headers(), {
      ...q,
      organizationId: id,
    });
  } catch (error) {
    if (error instanceof AccessError || error instanceof BusinessError) {
      if (error.code === "UNAUTHENTICATED") redirect("/sign-in");
      return (
        <main className="setup access-state">
          <h1>Monthly billing unavailable</h1>
          <p>{error.message}</p>
          <Link href="/admin">Return to administration</Link>
        </main>
      );
    }
    throw error;
  }
  return <PlatformBillingScreen key={JSON.stringify(q)} initial={data} />;
}
