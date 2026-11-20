import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth";
import { SignOut } from "@/components/sign-out";
export const dynamic = "force-dynamic";
export default async function Workspace() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return (
    <main className="setup">
      <h1>Welcome, {session.user.name}</h1>
      <p>
        You are signed in. Your staff workspace will be available after
        organization and branch permissions are connected.
      </p>
      <SignOut />
    </main>
  );
}
