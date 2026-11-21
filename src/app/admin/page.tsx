import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPlatform } from "@/modules/platform";
import { AccessError } from "@/server/security/errors";
import { SignOut } from "@/components/sign-out";
import { PlatformScreen } from "@/modules/platform/platform-screen";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let data;
  const query = await searchParams;
  try {
    data = await getPlatform().get(await headers(), query);
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.code === "UNAUTHENTICATED") redirect("/sign-in");
      return (
        <main className="setup access-state">
          <h1>Platform access unavailable</h1>
          <p>
            This account does not have an active platform administrator grant.
          </p>
          <Link href="/workspace">Your gym workspace</Link>
          <SignOut />
        </main>
      );
    }
    throw error;
  }
  return <PlatformScreen key={JSON.stringify(query)} initial={data} />;
}
