import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboard } from "@/modules/dashboard";
import { DashboardScreen } from "@/modules/dashboard/dashboard-screen";
import { AccessError } from "@/server/security/errors";
import { BusinessError } from "@/server/errors";
export const dynamic = "force-dynamic";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let data;
  try {
    data = await getDashboard().get(await headers(), await searchParams);
  } catch (error) {
    if (error instanceof AccessError || error instanceof BusinessError) {
      if (error.code === "UNAUTHENTICATED") redirect("/sign-in");
      if (error.code === "FORBIDDEN") redirect("/workspace");
      return (
        <main className="setup access-state">
          <h1>Dashboard unavailable</h1>
          <p>{error.message}</p>
          <Link href="/workspace">Return to workspace</Link>
        </main>
      );
    }
    throw error;
  }
  return <DashboardScreen data={data} />;
}
