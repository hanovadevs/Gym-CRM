"use client";
import { useState, useSyncExternalStore } from "react";
import { Drawer } from "./ui/primitives";
import { useHydrated } from "@/lib/use-hydrated";
type Page = "workspace" | "members" | "plans" | "settings" | "dashboard";
const key = "jym.sidebar.collapsed.v1";
let transient: boolean | undefined;
function snapshot() {
  if (transient !== undefined) return transient;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}
function subscribe(notify: () => void) {
  const storage = () => {
    transient = undefined;
    notify();
  };
  window.addEventListener("storage", storage);
  window.addEventListener("jym-sidebar", notify);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener("jym-sidebar", notify);
  };
}
function setCollapsed(v: boolean) {
  transient = v;
  try {
    localStorage.setItem(key, String(v));
  } catch {}
  window.dispatchEvent(new Event("jym-sidebar"));
}
const paths: Record<string, string> = {
  Workspace: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  Dashboard: "M3 12 12 3l9 9 M5 10v11h14V10 M9 21v-7h6v7",
  Members:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  Plans: "m12 3 9 5-9 5-9-5 9-5 M3 12l9 5 9-5 M3 16l9 5 9-5",
  Settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3",
  Attendance:
    "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2 M8 15l3 3 5-5",
  Payments: "M3 5h18v14H3z M3 10h18 M7 15h4",
  Classes: "M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h4",
  Trainers: "M3 8v8 M7 6v12 M7 12h10 M17 6v12 M21 8v8",
  Enquiries: "M4 4h16v13H9l-5 4V4 M8 8h8 M8 12h5",
  Expenses: "M6 3h12v18l-3-2-3 2-3-2-3 2V3 M9 8h6 M9 12h6",
  Reports: "M4 20V4 M4 20h17 M9 16V9 M14 16V5 M19 16v-4",
};
function Icon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="21"
      height="21"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.Workspace} />
    </svg>
  );
}
export function AppSidebar({
  organization,
  active,
  canManageSettings = false,
  canManageMembers = true,
  canReadPlans = true,
  preview = false,
}: {
  organization: { id: string; name: string };
  active: Page;
  canManageSettings?: boolean;
  canManageMembers?: boolean;
  canReadPlans?: boolean;
  preview?: boolean;
}) {
  const collapsed = useSyncExternalStore(subscribe, snapshot, () => false),
    hydrated = useHydrated(),
    [mobile, setMobile] = useState(false);
  const items = preview
    ? [
        { name: "Dashboard", page: "dashboard", href: "/dashboard" },
        ...[
          "Members",
          "Plans",
          "Attendance",
          "Payments",
          "Classes",
          "Trainers",
          "Enquiries",
          "Expenses",
          "Reports",
        ].map((name) => ({ name, page: name.toLowerCase(), href: "" })),
      ]
    : [
        { name: "Workspace", page: "workspace", href: "/workspace" },
        ...(canManageMembers
          ? [{ name: "Members", page: "members", href: "/members" }]
          : []),
        ...(canReadPlans
          ? [{ name: "Plans", page: "plans", href: "/plans" }]
          : []),
      ];
  const href = (path: string) =>
    path + (preview ? "" : "?organizationId=" + organization.id);
  function links(label: string) {
    return (
      <nav aria-label={label}>
        {items.map((i) =>
          i.href ? (
            <a
              key={i.name}
              href={href(i.href)}
              aria-label={i.name}
              aria-current={active === i.page ? "page" : undefined}
              title={collapsed ? i.name : undefined}
            >
              <span className="app-nav-icon">
                <Icon name={i.name} />
              </span>
              <span className="app-nav-label">{i.name}</span>
            </a>
          ) : (
            <button
              key={i.name}
              disabled
              title="Available in a future development task"
            >
              <span className="app-nav-icon">
                <Icon name={i.name} />
              </span>
              <span className="app-nav-label">{i.name}</span>
            </button>
          ),
        )}
      </nav>
    );
  }
  const settings =
    canManageSettings || preview ? (
      <div className="app-nav-settings">
        {preview ? (
          <button disabled>
            <Icon name="Settings" />
            <span className="app-nav-label">Settings</span>
          </button>
        ) : (
          <a
            href={href("/settings")}
            aria-label="Settings"
            title={collapsed ? "Settings" : undefined}
            aria-current={active === "settings" ? "page" : undefined}
          >
            <Icon name="Settings" />
            <span className="app-nav-label">Settings</span>
          </a>
        )}
      </div>
    ) : null;
  return (
    <>
      <aside className="app-sidebar" data-collapsed={collapsed}>
        <a
          className="app-brand"
          aria-label="Jym CRM"
          href={href(preview ? "/dashboard" : "/workspace")}
        >
          <span className="app-brand-symbol">J</span>
          <span className="app-nav-label">Jym CRM</span>
        </a>
        <p className="app-nav-caption">Your workspace</p>
        {links(preview ? "Main navigation" : "Workspace navigation")}
        <div className="app-sidebar-bottom">
          {settings}
          <a
            className="app-gym-card"
            href={href(preview ? "/dashboard" : "/workspace")}
            title={organization.name}
          >
            <span className="app-gym-initial">
              {organization.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="app-nav-label">
              <strong>{organization.name}</strong>
              <small>Gym workspace</small>
            </span>
          </a>
          <button
            className="app-collapse"
            disabled={!hydrated}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path d={collapsed ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} />
            </svg>
            <span className="app-nav-label">Collapse sidebar</span>
          </button>
        </div>
      </aside>
      <button
        className="app-mobile-menu"
        disabled={!hydrated}
        aria-label="Menu"
        aria-expanded={mobile}
        aria-controls="mobile-app-navigation"
        onClick={() => setMobile(true)}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M4 6h16 M4 12h16 M4 18h16" />
        </svg>
      </button>
      {mobile ? (
        <Drawer
          title="Navigation"
          className="app-nav-drawer"
          onClose={() => setMobile(false)}
        >
          <div id="mobile-app-navigation" className="app-mobile-links">
            {links(preview ? "Main navigation" : "Workspace navigation")}
            {settings}
            <p className="app-mobile-gym">{organization.name}</p>
          </div>
        </Drawer>
      ) : null}
    </>
  );
}
