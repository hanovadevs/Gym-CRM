import { redirect } from "next/navigation";
/** Legacy bookmarks lead to real authenticated workspaces. */
export default async function DashboardAlias({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams,
    p = new URLSearchParams();
  for (const key of ["organizationId", "branchId"]) {
    const v = q[key];
    if (typeof v === "string") p.set(key, v);
  }
  redirect("/workspace" + (p.size ? "?" + p : ""));
}
