import Link from "next/link";
import Form from "next/form";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSecurity } from "@/server/security";
import { AccessError } from "@/server/security/errors";
import { SignOut } from "@/components/sign-out";
import { SectionTitle } from "@/components/ui/section-title";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { getPlatform } from "@/modules/platform";
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
      if (
        error.code === "FORBIDDEN" &&
        (await getPlatform().available(await headers()))
      )
        redirect("/admin");
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
  const query = new URLSearchParams({
    organizationId: workspace.organization.id,
  });
  if (typeof selected === "string" && selected) query.set("branchId", selected);
  const destinations = [
    {
      action: "dashboard.read",
      path: "/dashboard",
      title: "Gym overview",
      description: "Today’s attendance, collections and upcoming renewals.",
      label: "Open dashboard",
    },
    {
      action: "members.manage",
      path: "/members",
      title: "Members & memberships",
      description:
        "Register members, manage profiles and maintain their memberships.",
      label: "Open members",
    },
    {
      action: "attendance.manage",
      path: "/attendance",
      title: "Front desk",
      description: "Check access, welcome members and manage visits.",
      label: "Open attendance",
    },
    {
      action: "billing.read",
      path: "/payments",
      title: "Payments & invoices",
      description: "Review balances, record payments and download receipts.",
      label: "Open payments",
    },
    {
      action: "plans.read",
      path: "/plans",
      title: "Membership plans",
      description: "Review the plans and benefits available at your gym.",
      label: "Open plans",
    },
    {
      action: "classes.read",
      path: "/classes",
      title: "Classes & bookings",
      description:
        "Schedule classes, manage spaces and reserve eligible member seats.",
      label: "Open classes",
    },
    {
      action: "trainers.read",
      path: "/trainers",
      title: "Coaching team",
      description:
        "Maintain trainer profiles, specialties and branch assignments.",
      label: "Open trainers",
    },
    {
      action: "payroll.manage",
      path: "/employees",
      title: "Employees & salaries",
      description:
        "Manage employee profiles, monthly salary dues and payment history.",
      label: "Open employees",
    },
    {
      action: "expenses.manage",
      path: "/expenses",
      title: "Expense ledger",
      description:
        "Record operating expenses and retain private receipt images.",
      label: "Open expenses",
    },
    {
      action: "settings.read",
      path: "/settings",
      title: "Gym settings",
      description:
        "Maintain gym preferences, branches and permitted staff settings.",
      label: "Open settings",
    },
  ].filter((item) =>
    workspace.actions.includes(
      item.action as (typeof workspace.actions)[number],
    ),
  );
  return (
    <WorkspaceFrame
      organization={workspace.organization}
      active="workspace"
      canManageSettings={workspace.actions.includes("settings.read")}
      canManageMembers={workspace.actions.includes("members.manage")}
      canReadPlans={workspace.actions.includes("plans.read")}
      canReadBilling={workspace.actions.includes("billing.read")}
    >
      <div className="secure-main workspace-home">
        <section className="page-heading workspace-welcome">
          <div>
            <p className="eyebrow">{workspace.organization.name}</p>
            <h1>Welcome, {workspace.userName}</h1>
            <p>Everything you need to run your gym, in one place.</p>
            <div className="workspace-context">
              <span className="role-name">{workspace.role}</span>
              <span>
                {workspace.branches.length} permitted{" "}
                {workspace.branches.length === 1 ? "branch" : "branches"}
              </span>
              <span>{workspace.organization.timeZone}</span>
            </div>
          </div>
        </section>
        <div className="scope-selectors">
          {workspace.organizations.length > 1 ? (
            <Form action="/workspace">
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
            </Form>
          ) : null}
          {workspace.availableBranches.length > 1 ? (
            <Form action="/workspace">
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
            </Form>
          ) : null}
        </div>
        <section className="workspace-launchpad">
          <SectionTitle
            title="Your workspace"
            help="Open a workflow below. Available tools follow your current role and selected branch; every operation rechecks your access."
          />
          {destinations.length ? (
            <div className="workspace-tools">
              {destinations.map((item) => (
                <Link
                  key={item.path}
                  href={item.path + "?" + query.toString()}
                  className="workspace-tool"
                >
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <span className="workspace-tool-link">
                    {item.label}
                    <span aria-hidden="true">→</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="dashboard-empty">
              Your role currently has no general management tools. Contact your
              gym administrator to review your assigned access.
            </p>
          )}
        </section>{" "}
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
      </div>
    </WorkspaceFrame>
  );
}
