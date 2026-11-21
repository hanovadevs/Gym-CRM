import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPayments } from "@/modules/payments";
import { ReceiptScreen } from "@/modules/payments/receipt-screen";
import { AccessError } from "@/server/security/errors";
import { BusinessError } from "@/server/errors";
import { SignOut } from "@/components/sign-out";
export const dynamic = "force-dynamic";
export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let receipt;
  try {
    receipt = await getPayments().receipt(
      await headers(),
      (await params).id,
      await searchParams,
    );
  } catch (e) {
    if (e instanceof AccessError || e instanceof BusinessError) {
      if (e.code === "UNAUTHENTICATED") redirect("/sign-in");
      return (
        <main className="setup access-state">
          <h1>Receipt unavailable</h1>
          <p>{e.message}</p>
          <a href="/workspace" className="text-action">
            Return to workspace
          </a>
          <SignOut />
        </main>
      );
    }
    throw e;
  }
  return <ReceiptScreen initial={receipt} />;
}
