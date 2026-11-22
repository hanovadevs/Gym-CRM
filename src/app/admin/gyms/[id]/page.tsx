import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPlatform } from "@/modules/platform";
import { AccessError } from "@/server/security/errors";
import { BusinessError } from "@/server/errors";
import { GymAnalyticsScreen } from "@/modules/platform/analytics-screen";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  let data;
  try {
    data = await getPlatform().analytics(await headers(), {
      ...(await searchParams),
      organizationId: id,
    });
  } catch (error) {
    if (error instanceof AccessError || error instanceof BusinessError) {
      if (error.code === "UNAUTHENTICATED") redirect("/sign-in");
      return (
        <main className="setup access-state">
          <h1>Gym analytics unavailable</h1>
          <p>{error.message}</p>
          <Link href={"/admin/gyms/" + id}>Reset analytics filters</Link>
          <Link href="/admin">Return to administration</Link>
        </main>
      );
    }
    throw error;
  }
  return <GymAnalyticsScreen data={data} />;
}
