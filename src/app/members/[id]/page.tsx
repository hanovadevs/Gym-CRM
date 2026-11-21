import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getProfiles } from "@/modules/members/profile";
import { ProfileScreen } from "@/modules/members/profile-screen";
import { AccessError } from "@/server/security/errors";
import { BusinessError } from "@/server/errors";
import { SignOut } from "@/components/sign-out";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let initial;
  try {
    initial = await getProfiles().get(
      await headers(),
      (await params).id,
      await searchParams,
    );
  } catch (e) {
    if (e instanceof AccessError || e instanceof BusinessError) {
      if (e.code === "UNAUTHENTICATED") redirect("/sign-in");
      return (
        <main className="setup access-state">
          <h1>Profile unavailable</h1>
          <p>{e.message}</p>
          <Link className="text-action" href="/members">
            Return to members
          </Link>
          <SignOut />
        </main>
      );
    }
    throw e;
  }
  return <ProfileScreen initial={initial} />;
}
