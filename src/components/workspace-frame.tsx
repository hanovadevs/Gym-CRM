import Link from "next/link";
import { SignOut } from "./sign-out";
import { AppSidebar } from "./app-sidebar";
export function WorkspaceFrame({
  organization,
  canManageFees = false,
  canManageSettings,
  canManageMembers = true,
  canReadPlans = true,
  canReadBilling = true,
  active = "members",
  children,
}: {
  organization: { id: string; name: string };
  canManageFees?: boolean;
  canManageSettings: boolean;
  canManageMembers?: boolean;
  canReadPlans?: boolean;
  canReadBilling?: boolean;
  active?:
    | "members"
    | "plans"
    | "payments"
    | "workspace"
    | "attendance"
    | "dashboard"
    | "expenses"
    | "trainers"
    | "employees"
    | "classes"
    | "member-fees"
    | "reports";

  children: React.ReactNode;
}) {
  const org = "?organizationId=" + organization.id;
  return (
    <div className="settings-layout">
      <AppSidebar
        organization={organization}
        active={active}
        canManageFees={canManageFees}
        canManageSettings={canManageSettings}
        canManageMembers={canManageMembers}
        canReadPlans={canReadPlans}
        canReadBilling={canReadBilling}
      />
      <div className="settings-content">
        <header className="settings-topbar">
          <Link href={"/workspace" + org}>{organization.name}</Link>
          <SignOut />
        </header>
        <main className="settings-main members-main">{children}</main>
      </div>
    </div>
  );
}
