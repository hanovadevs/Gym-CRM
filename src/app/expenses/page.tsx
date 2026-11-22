import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getExpenses } from "@/modules/expenses";
import { ExpensesScreen } from "@/modules/expenses/expenses-screen";
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
    data = await getExpenses().get(await headers(), await searchParams);
  } catch (error) {
    if (error instanceof AccessError || error instanceof BusinessError) {
      if (error.code === "UNAUTHENTICATED") redirect("/sign-in");
      return (
        <main className="setup access-state">
          <h1>Expenses unavailable</h1>
          <p>{error.message}</p>
          <Link href="/workspace">Return to workspace</Link>
        </main>
      );
    }
    throw error;
  }
  return <ExpensesScreen key={data.requestId} initial={data} />;
}
