import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPayroll } from "@/modules/payroll";
import { EmployeesScreen } from "@/modules/payroll/employees-screen";
import { AccessError } from "@/server/security/errors";
import { BusinessError } from "@/server/errors";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let data;
  try {
    data = await getPayroll().get(await headers(), await searchParams);
  } catch (error) {
    if (error instanceof AccessError || error instanceof BusinessError) {
      if (error.code === "UNAUTHENTICATED") redirect("/sign-in");
      return (
        <main className="setup access-state">
          <h1>Employees unavailable</h1>
          <p>{error.message}</p>
          <Link href="/workspace">Return to workspace</Link>
        </main>
      );
    }
    throw error;
  }
  return <EmployeesScreen key={data.requestId} initial={data} />;
}
