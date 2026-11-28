import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getEnquiries } from "@/modules/enquiries";
import { EnquiriesScreen } from "@/modules/enquiries/screen";
import { AccessError } from "@/server/security/errors";
import { BusinessError } from "@/server/errors";
export const dynamic = "force-dynamic";
export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let initial;
  try {
    initial = await getEnquiries().get(await headers(), await searchParams);
  } catch (e) {
    if (e instanceof AccessError || e instanceof BusinessError) {
      if (e.code === "UNAUTHENTICATED") redirect("/sign-in");
      return (
        <main className="setup">
          <h1>Enquiries unavailable</h1>
          <p>{e.message}</p>
          <Link href="/workspace">Return to workspace</Link>
        </main>
      );
    }
    throw e;
  }
  return (
    <EnquiriesScreen
      key={initial.organization.id + JSON.stringify(initial.query)}
      initial={initial}
    />
  );
}
