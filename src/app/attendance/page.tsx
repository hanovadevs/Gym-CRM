import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAttendance } from "@/modules/attendance";
import { AttendanceScreen } from "@/modules/attendance/attendance-screen";
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
    data = await getAttendance().get(await headers(), await searchParams);
  } catch (error) {
    if (error instanceof AccessError || error instanceof BusinessError) {
      if (error.code === "UNAUTHENTICATED") redirect("/sign-in");
      return (
        <main className="setup access-state">
          <h1>Attendance unavailable</h1>
          <p>{error.message}</p>
          <Link href="/workspace">Return to workspace</Link>
        </main>
      );
    }
    throw error;
  }
  return <AttendanceScreen key={data.requestId} initial={data} />;
}
