import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getReport } from "@/modules/reports/service";
import { ReportsScreen } from "@/modules/reports/screen";
import { AccessError } from "@/server/security/errors";
import { BusinessError } from "@/server/errors";
export const dynamic = "force-dynamic";
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams,
    print = raw.print === "1";
  const query = { ...raw };
  delete query.print;
  let data;
  try {
    data = await getReport(await headers(), query, print);
  } catch (e) {
    if (e instanceof AccessError || e instanceof BusinessError) {
      if (e.code === "UNAUTHENTICATED") redirect("/sign-in");
      return (
        <main className="setup">
          <h1>Reports unavailable</h1>
          <p>{e.message}</p>
          <Link href="/workspace">Return to workspace</Link>
        </main>
      );
    }
    throw e;
  }
  return <ReportsScreen data={data} print={print} />;
}
