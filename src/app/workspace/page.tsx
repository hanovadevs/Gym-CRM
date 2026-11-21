import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSecurity } from "@/server/security";
import { AccessError } from "@/server/security/errors";
import { SignOut } from "@/components/sign-out";
import { SectionTitle } from "@/components/ui/section-title";
import { WorkspaceFrame } from "@/components/workspace-frame";
export const dynamic = "force-dynamic";
export default async function Workspace({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let workspace;
  try {
    workspace = await getSecurity().workspace(
      await headers(),
      await searchParams,
    );
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.code === "UNAUTHENTICATED") redirect("/sign-in");
      return (
        <main className="setup access-state">
          <h1>
            {error.code === "FORBIDDEN"
              ? "Access unavailable"
              : error.code === "NOT_FOUND"
                ? "Workspace not found"
                : "Check your workspace selection"}
          </h1>
          <p>{error.message}</p>
          <p>Contact your gym administrator if your access has changed.</p>
          <Link className="text-action" href="/workspace">
            Return to your workspaces
          </Link>
          <SignOut />
        </main>
      );
    }
    throw error;
  }
  const selected = (await searchParams).branchId;
  return (
    <WorkspaceFrame
      organization={workspace.organization}
      active="workspace"
      canManageSettings={workspace.actions.includes("settings.read")}
      canManageMembers={workspace.actions.includes("members.manage")}
      canReadPlans={workspace.actions.includes("plans.read")}
      canReadBilling={workspace.actions.includes("billing.read")}
    >
      <div className="secure-main">
        <section className="page-heading">
          <div>
            <p className="eyebrow">{workspace.organization.name}</p>
            <h1>Welcome, {workspace.userName}</h1>
            <p>Your staff workspace and access.</p>
          </div>
        </section>
        <div className="scope-selectors">
          {workspace.organizations.length > 1 ? (
            <form action="/workspace">
              <div className="field">
                <label htmlFor="organization">Gym workspace</label>
                <select
                  id="organization"
                  name="organizationId"
                  defaultValue={workspace.organization.id}
                >
                  {workspace.organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit">Switch workspace</button>
            </form>
          ) : null}
          {workspace.availableBranches.length > 1 ? (
            <form action="/workspace">
              <input
                type="hidden"
                name="organizationId"
                value={workspace.organization.id}
              />
              <div className="field">
                <label htmlFor="branch">Branch scope</label>
                <select
                  id="branch"
                  name="branchId"
                  defaultValue={typeof selected === "string" ? selected : ""}
                >
                  <option value="">All permitted branches</option>
                  {workspace.availableBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit">Apply branch</button>
            </form>
          ) : null}
        </div>
        <div className="secure-grid">
          <section className="panel">
            <SectionTitle
              title="Your access"
              help="Your role and active staff membership are checked on every protected request. Changes made by an administrator take effect on your next operation."
            />
            <dl className="access-details">
              <dt>Gym</dt>
              <dd>{workspace.organization.name}</dd>
              <dt>Role</dt>
              <dd className="role-name">{workspace.role}</dd>
              <dt>Time zone</dt>
              <dd>{workspace.organization.timeZone}</dd>
            </dl>
          </section>
          <section className="panel">
            <SectionTitle
              title="Branch scope"
              help="Owners can access active branches throughout their gym. Other staff can access only active branches explicitly assigned to them. Choosing a branch narrows the current workspace."
            />
            <ul className="branch-list">
              {workspace.branches.map((branch) => (
                <li key={branch.id}>
                  <strong>{branch.name}</strong>
                  <span>{branch.code}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section className="panel workspace-next">
          <SectionTitle
            title="Your workspace"
            help="Your session, gym and branch scope are connected to persisted records. Owners and managers can open settings. Other workflows become available as their modules are implemented."
          />
          <p>
            {workspace.actions.includes("settings.read")
              ? "Manage your gym preferences and permitted staff settings. "
              : "Your workspace access is active. "}
            Register and maintain members in your permitted branches. Membership
            enrollment is available from member profiles. Record funds received and share paid receipts from Payments.
          </p>
          {workspace.actions.includes("settings.read") ? (
            <Link
              className="text-action"
              href={"/settings?organizationId=" + workspace.organization.id}
            >
              Open settings
            </Link>
          ) : null}
          {workspace.actions.includes("members.manage") ? (
            <Link
              className="text-action workspace-members-link"
              href={
                "/members?organizationId=" +
                workspace.organization.id +
                (typeof selected === "string" && selected
                  ? "&branchId=" + selected
                  : "")
              }
            >
              Open members
            </Link>
          ) : null}
          {workspace.actions.includes("plans.read") ? (
            <Link
              className="text-action workspace-members-link"
              href={"/plans?organizationId=" + workspace.organization.id}
            >
              Open plans
            </Link>
          ) : null}
        </section>
      </div>
    </WorkspaceFrame>
  );
}
