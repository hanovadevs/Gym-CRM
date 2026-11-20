"use client";
import { useState } from "react";
const modules = [
  "Members",
  "Plans",
  "Attendance",
  "Payments",
  "Classes",
  "Trainers",
  "Enquiries",
  "Expenses",
  "Reports",
];

/** Development-only shell; live navigation must be derived from authorized context. */
export function PreviewShell({
  children,
  onAccount,
}: {
  children: React.ReactNode;
  onAccount: () => void;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="workspace">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside
        id="workspace-navigation"
        className={menu ? "sidebar open" : "sidebar"}
      >
        <a className="brand" href="/dashboard">
          <span className="brand-mark" aria-hidden="true">
            J
          </span>
          Jym CRM
        </a>
        <nav aria-label="Main navigation">
          <a className="selected" aria-current="page" href="/dashboard">
            Dashboard
          </a>
          {modules.map((name) => (
            <button
              key={name}
              disabled
              title="Available in a future development task"
            >
              {name}
            </button>
          ))}
        </nav>
        <footer>
          <button disabled>Settings</button>
          <p>Crown Fitness</p>
        </footer>
      </aside>
      <div className="content">
        <header className="topbar">
          <button
            className="menu"
            aria-expanded={menu}
            aria-controls="workspace-navigation"
            onClick={() => setMenu(!menu)}
          >
            Menu
          </button>
          <div className="gym-context">
            Crown Fitness <span>Main branch</span>
          </div>
          <div className="header-right">
            <button
              className="avatar"
              aria-label="Open account"
              onClick={() => onAccount()}
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
