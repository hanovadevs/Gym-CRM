import { SignOut } from "./sign-out";
export function WorkspaceFrame({
  organization,
  canManageSettings,
  canManageMembers = true,
  active = "members",
  children,
}: {
  organization: { id: string; name: string };
  canManageSettings: boolean;
  canManageMembers?: boolean;
  active?: "members" | "plans";
  children: React.ReactNode;
}) {
  const org = "?organizationId=" + organization.id;
  return (
    <div className="settings-layout">
      <aside className="settings-sidebar">
        <a className="brand" href={"/workspace" + org}>
          <span className="brand-mark" aria-hidden="true">
            J
          </span>
          Jym CRM
        </a>
        <nav aria-label="Workspace navigation">
          <a href={"/workspace" + org}>Workspace</a>
          {canManageMembers ? (
            <a
              className={active === "members" ? "selected" : undefined}
              href={"/members" + org}
              aria-current={active === "members" ? "page" : undefined}
            >
              Members
            </a>
          ) : null}
          <a
            className={active === "plans" ? "selected" : undefined}
            href={"/plans" + org}
            aria-current={active === "plans" ? "page" : undefined}
          >
            Plans
          </a>
          {canManageSettings ? <a href={"/settings" + org}>Settings</a> : null}
        </nav>
        <p>{organization.name}</p>
      </aside>
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
