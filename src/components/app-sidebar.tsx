"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { BrandMark } from "./brand";
import { Drawer } from "./ui/primitives";
import { useHydrated } from "@/lib/use-hydrated";
type Page =
  | "workspace"
  | "members"
  | "plans"
  | "payments"
  | "settings"
  | "dashboard"
  | "member-fees"
  | "classes"
  | "employees"
  | "trainers"
  | "expenses"
  | "attendance"
  | "reports";
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
  "Member fees": "M4 4h16v16H4z M8 8h8 M8 12h5 M8 16h8",
  Members:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  Plans: "m12 3 9 5-9 5-9-5 9-5 M3 12l9 5 9-5 M3 16l9 5 9-5",
  Settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3",
  Attendance:
    "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2 M8 15l3 3 5-5",
  Payments: "M3 5h18v14H3z M3 10h18 M7 15h4",
  Classes: "M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h4",
  Employees:
    "M4 21v-3a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v3 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
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
  canManageFees = false,
  canManageSettings = false,
  canManageMembers = true,
  canReadPlans = true,
  canReadBilling = false,
}: {
  organization: { id: string; name: string };
  active: Page;
  canManageFees?: boolean;
  canManageSettings?: boolean;
  canManageMembers?: boolean;
  canReadPlans?: boolean;
  canReadBilling?: boolean;
}) {
  const collapsed = useSyncExternalStore(subscribe, snapshot, () => false),
    hydrated = useHydrated(),
    [mobile, setMobile] = useState(false);
  const items = [
    { name: "Workspace", page: "workspace", href: "/workspace" },
    ...(canReadBilling
      ? [{ name: "Dashboard", page: "dashboard", href: "/dashboard" }]
      : []),
    ...(canManageMembers
      ? [{ name: "Members", page: "members", href: "/members" }]
      : []),
    ...(canManageMembers ||
    canManageSettings ||
    (!canReadBilling && !canReadPlans)
      ? [{ name: "Classes", page: "classes", href: "/classes" }]
      : []),
    ...(canManageMembers ||
    canManageSettings ||
    (!canReadBilling && !canReadPlans)
      ? [{ name: "Trainers", page: "trainers", href: "/trainers" }]
      : []),
    ...(canReadPlans ? [{ name: "Plans", page: "plans", href: "/plans" }] : []),
    ...(canManageMembers
      ? [{ name: "Attendance", page: "attendance", href: "/attendance" }]
      : []),
    ...(canReadBilling
      ? [{ name: "Payments", page: "payments", href: "/payments" }]
      : []),
    ...(canManageFees
      ? [{ name: "Member fees", page: "member-fees", href: "/member-fees" }]
      : []),
    ...(canManageSettings || (canReadBilling && !canManageMembers)
      ? [
          { name: "Expenses", page: "expenses", href: "/expenses" },
          { name: "Employees", page: "employees", href: "/employees" },
        ]
      : []),
    ...(canManageSettings || (canReadBilling && !canManageMembers)
      ? [{ name: "Reports", page: "reports", href: "/reports" }]
      : []),
  ];
  const selection = useSearchParams();
  const href = (path: string) => {
    const query = new URLSearchParams({ organizationId: organization.id });
    const branch = selection.get("branchId");
    if (branch) query.set("branchId", branch);
    return path + "?" + query.toString();
  };
  const primary = items.filter((i) =>
    ["dashboard", "members", "attendance", "payments"].includes(i.page),
  );
  if (!primary.length) primary.push(items[0]);
  const secondary = items.filter((i) => !primary.includes(i));
  function links(label: string) {
    return (
      <nav aria-label={label}>
        {items.map((i) =>
          i.href ? (
            <Link
              key={i.name}
              href={href(i.href)}
              prefetch={true}
              onNavigate={() => setMobile(false)}
              aria-label={i.name}
              aria-current={active === i.page ? "page" : undefined}
              title={collapsed ? i.name : undefined}
            >
              <span className="app-nav-icon">
                <Icon name={i.name} />
              </span>
              <span className="app-nav-label">{i.name}</span>
            </Link>
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
  const settings = canManageSettings ? (
    <div className="app-nav-settings">
      <Link
        href={href("/settings")}
        prefetch={true}
        onNavigate={() => setMobile(false)}
        aria-label="Settings"
        title={collapsed ? "Settings" : undefined}
        aria-current={active === "settings" ? "page" : undefined}
      >
        <Icon name="Settings" />
        <span className="app-nav-label">Settings</span>
      </Link>
    </div>
  ) : null;
  return (
    <>
      <aside className="app-sidebar" data-collapsed={collapsed}>
        <Link
          className="app-brand"
          aria-label="Mojym"
          href={href(canReadBilling ? "/dashboard" : "/workspace")}
        >
          <span className="app-brand-symbol">
            <BrandMark />
          </span>
          <span className="app-nav-label">Mojym</span>
        </Link>
        <p className="app-nav-caption">Your workspace</p>
        {links("Workspace navigation")}
        <div className="app-sidebar-bottom">
          {settings}
          <Link
            className="app-gym-card"
            href={href("/workspace")}
            title={organization.name}
          >
            <span className="app-gym-initial">
              {organization.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="app-nav-label">
              <strong>{organization.name}</strong>
              <small>Gym workspace</small>
            </span>
          </Link>
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
      <nav className="mobile-bottom-nav" aria-label="Primary navigation">
        {primary.map((item) => (
          <Link
            key={item.page}
            href={href(item.href)}
            prefetch={true}
            aria-label={item.name}
            aria-current={active === item.page ? "page" : undefined}
            onNavigate={() => setMobile(false)}
          >
            <Icon name={item.name} />
            <span>{item.name}</span>
          </Link>
        ))}
        <button
          disabled={!hydrated}
          aria-label="More"
          aria-expanded={mobile}
          aria-controls="mobile-app-navigation"
          data-active={
            secondary.some((i) => i.page === active) || active === "settings"
          }
          onClick={() => setMobile(true)}
        >
          <svg
            viewBox="0 0 24 24"
            width="21"
            height="21"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span>More</span>
        </button>
      </nav>
      {mobile ? (
        <Drawer
          title="More navigation"
          className="app-nav-drawer"
          onClose={() => setMobile(false)}
        >
          <div id="mobile-app-navigation" className="app-mobile-links">
            <nav aria-label="Secondary navigation">
              {secondary.map((item) => (
                <Link
                  key={item.page}
                  href={href(item.href)}
                  aria-label={item.name}
                  aria-current={active === item.page ? "page" : undefined}
                  onNavigate={() => setMobile(false)}
                >
                  <Icon name={item.name} />
                  <span>{item.name}</span>
                </Link>
              ))}
            </nav>
            {settings}
            <p className="app-mobile-gym">{organization.name}</p>
          </div>
        </Drawer>
      ) : null}
    </>
  );
}
