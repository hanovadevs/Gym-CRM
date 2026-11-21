"use client";
import { AppSidebar } from "./app-sidebar";
/** Development-only reference preview; live navigation comes from authorized context. */
export function PreviewShell({
  children,
  onAccount,
}: {
  children: React.ReactNode;
  onAccount: () => void;
}) {
  return (
    <div className="workspace">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <AppSidebar
        organization={{ id: "preview", name: "Crown Fitness" }}
        active="dashboard"
        preview
      />
      <div className="content">
        <header className="topbar">
          <div className="gym-context">
            Crown Fitness <span>Main branch</span>
          </div>
          <div className="header-right">
            <button
              className="avatar"
              aria-label="Open account"
              onClick={onAccount}
            >
              AH
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
