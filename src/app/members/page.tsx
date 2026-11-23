import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getMembers } from "@/modules/members";
import { MembersScreen } from "@/modules/members/members-screen";
import { AccessError } from "@/server/security/errors";
import { BusinessError } from "@/server/errors";
import { SignOut } from "@/components/sign-out";
export const dynamic = "force-dynamic";
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let initial;
  try {
    initial = await getMembers().list(await headers(), await searchParams);
  } catch (error) {
    if (error instanceof AccessError || error instanceof BusinessError) {
      if (error.code === "UNAUTHENTICATED") redirect("/sign-in");
      return (
        <main className="setup access-state">
          <h1>
            {error.code === "VALIDATION_ERROR"
              ? "Check your member filters"
              : "Members unavailable"}
          </h1>
          <p>{error.message}</p>
          <Link className="text-action" href="/workspace">
            Return to workspace
          </Link>
          <SignOut />
        </main>
      );
    }
    throw error;
  }
  return <MembersScreen key={initial.organization.id} initial={initial} />;
}
