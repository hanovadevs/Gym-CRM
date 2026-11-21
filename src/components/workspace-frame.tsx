import { SignOut } from "./sign-out";
import { AppSidebar } from "./app-sidebar";
export function WorkspaceFrame({
  organization,
  canManageSettings,
  canManageMembers = true,
  canReadPlans = true,
  canReadBilling = true,
  active = "members",
  children,
}: {
  organization: { id: string; name: string };
  canManageSettings: boolean;
  canManageMembers?: boolean;
  canReadPlans?: boolean;
  canReadBilling?: boolean;
  active?: "members" | "plans" | "payments" | "workspace";
  children: React.ReactNode;
}) {
  const org = "?organizationId=" + organization.id;
  return (
    <div className="settings-layout">
      <AppSidebar
        organization={organization}
        active={active}
        canManageSettings={canManageSettings}
        canManageMembers={canManageMembers}
        canReadPlans={canReadPlans}
        canReadBilling={canReadBilling}
      />
      <div className="settings-content">
        <header className="settings-topbar">
          <a href={"/workspace" + org}>{organization.name}</a>
          <SignOut />
        </header>
        <main className="settings-main members-main">{children}</main>
      </div>
    </div>
  );
}
