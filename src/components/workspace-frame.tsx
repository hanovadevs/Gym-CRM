import { SignOut } from "./sign-out";
export function WorkspaceFrame({
  organization,
  canManageSettings,
  children,
}: {
  organization: { id: string; name: string };
  canManageSettings: boolean;
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
          <a className="selected" href={"/members" + org} aria-current="page">
            Members
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
