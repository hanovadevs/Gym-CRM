import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSettings } from "@/modules/settings";
import { AccessError } from "@/server/security/errors";
import { BusinessError } from "@/modules/settings/errors";
import { SignOut } from "@/components/sign-out";
import { SettingsScreen } from "@/modules/settings/settings-screen";
export const dynamic = "force-dynamic";
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let initial;
  try {
    initial = await getSettings().get(await headers(), await searchParams);
  } catch (error) {
    if (error instanceof AccessError || error instanceof BusinessError) {
      if (error.code === "UNAUTHENTICATED") redirect("/sign-in");
      return (
        <main className="setup access-state">
          <h1>
            {error.code === "VALIDATION_ERROR"
              ? "Check your settings selection"
              : "Settings unavailable"}
          </h1>
          <p>{error.message}</p>
          <Link href="/workspace" className="text-action">
            Return to workspace
          </Link>
          <SignOut />
        </main>
      );
    }
    throw error;
  }
  return <SettingsScreen initial={initial} />;
}
