import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getBilling } from "@/modules/billing";
import { InvoicesScreen } from "@/modules/billing/invoices-screen";
import { AccessError } from "@/server/security/errors";
import { BusinessError } from "@/server/errors";
import { SignOut } from "@/components/sign-out";
export const dynamic = "force-dynamic";
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let initial, detail;
  try {
    const { invoiceId, ...query } = await searchParams,
      h = await headers(),
      billing = getBilling();
    initial = await billing.list(h, query);
    detail = invoiceId
      ? await billing.get(h, Array.isArray(invoiceId) ? "" : invoiceId, {
          organizationId: initial.organization.id,
        })
      : null;
  } catch (e) {
    if (e instanceof AccessError || e instanceof BusinessError) {
      if (e.code === "UNAUTHENTICATED") redirect("/sign-in");
      return (
        <main className="setup access-state">
          <h1>
            {e.code === "VALIDATION_ERROR"
              ? "Check your invoice filters"
              : "Invoices unavailable"}
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
  return <InvoicesScreen initial={initial} initialDetail={detail} />;
}
