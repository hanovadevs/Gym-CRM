"use client";
import { useState } from "react";
import { PreviewShell } from "./preview-shell";
import { SectionTitle } from "./ui/section-title";
import { Drawer, Field, Pill, Table } from "./ui/primitives";
const members = [
  {
    name: "Sara Ahmed",
    initials: "SA",
    joined: "Joined today",
    plan: "Monthly · Rs.4,500",
  },
  {
    name: "Hamza Rauf",
    initials: "HR",
    joined: "Joined today",
    plan: "Monthly · Rs.4,500",
  },
  {
    name: "Muneeb Khan",
    initials: "MK",
    joined: "Joined yesterday",
    plan: "Quarterly · Rs.12,000",
  },
];
const renewals = [
  ["AR", "Ali Raza", "22 Nov 2026", "2"],
  ["FA", "Fatima Aslam", "23 Nov 2026", "3"],
  ["WK", "Waleed Khan", "24 Nov 2026", "4"],
];
export function Dashboard() {
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<string | null>(null);
  const [period, setPeriod] = useState("This week");
  const filtered = members.filter((m) =>
    m.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <PreviewShell onAccount={() => setDrawer("Preview account")}>
      <main id="main">
        <section className="page-heading">
          <div>
            <p className="eyebrow">FRIDAY, 20 NOVEMBER 2026</p>
            <h1>Good afternoon, Ali</h1>
            <p>Here’s what’s happening at your gym today.</p>
          </div>
          <button className="primary" onClick={() => setDrawer("Add member")}>
            Add member
          </button>
        </section>

        <section className="metrics" aria-label="Gym overview">
          {[
            ["Active members", "248", "Effective memberships today"],
            ["Today’s check-ins", "134", "Successful visit openings"],
            ["Collected this month", "Rs.286,500", "Payments less refunds"],
            ["Overdue invoices", "12", "Unpaid past the due date"],
          ].map(([label, value, note]) => (
            <article className="panel metric" key={label}>
              <SectionTitle
                title={label}
                help={
                  note +
                  ". These illustrative figures are not live database totals."
                }
              />
              <strong>{value}</strong>
              <p>{note}</p>
            </article>
          ))}
        </section>
        <div className="middle-grid">
          <section className="panel activity">
            <div className="panel-heading">
              <SectionTitle
                title="Member activity"
                help="Successful visit openings for the selected week. Repeat visits count separately. This chart uses illustrative records."
              />
              <label className="sr-only" htmlFor="period">
                Activity period
              </label>
              <select
                id="period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option>This week</option>
                <option>Last week</option>
              </select>
            </div>
            <p className="support">
              Successful check-ins · {period === "This week" ? "16–22" : "9–15"}{" "}
              November
            </p>
            <div
              className="chart"
              role="img"
              aria-label={
                period === "This week"
                  ? "Monday 68, Tuesday 96, Wednesday 105, Thursday 128, Friday 134. Saturday and Sunday have not occurred yet."
                  : "Monday 61, Tuesday 82, Wednesday 98, Thursday 112, Friday 76, Saturday 104, Sunday 82."
              }
            >
              {(period === "This week"
                ? [68, 96, 105, 128, 134, 0, 0]
                : [61, 82, 98, 112, 76, 104, 82]
              ).map((n, i) => (
                <div className="bar-column" key={i}>
                  <span className="bar-value">{n || "—"}</span>
                  <div
                    className={"bar " + (i === 4 ? "emphasis" : "")}
                    style={{ height: n + "px" }}
                  />
                  <span>
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="panel quick">
            <SectionTitle
              title="Quick actions"
              help="Register members, collect payments, check in visitors and schedule classes. These workflows are not connected yet; opening an action will explain availability."
            />
            <p className="support">Explore the workflows coming next.</p>
            <div className="actions">
              {["Add member", "Record payment", "Check in", "Create class"].map(
                (x) => (
                  <button key={x} onClick={() => setDrawer(x)}>
                    {x}
                  </button>
                ),
              )}
            </div>
          </section>
        </div>
        <div className="bottom-grid">
          <section className="panel">
            <div className="panel-heading">
              <SectionTitle
                title="Recent members"
                help="Search the illustrative member list. These people are not saved database records."
              />
              <span className="subtle">3 new</span>
            </div>
            <label className="sr-only" htmlFor="search">
              Search members
            </label>
            <input
              className="member-search"
              id="search"
              type="search"
              placeholder="Search members…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {filtered.length ? (
              filtered.map((m) => (
                <button
                  className="person-row"
                  key={m.name}
                  onClick={() => setDrawer(m.name)}
                >
                  <span className="initials">{m.initials}</span>
                  <span className="person-info">
                    <strong>{m.name}</strong>
                    <span>{m.joined}</span>
                  </span>
                  <Pill>Active</Pill>
                </button>
              ))
            ) : (
              <p role="status" className="empty">
                No members match “{query}”.
              </p>
            )}
          </section>
          <section className="panel schedule">
            <div className="panel-heading">
              <SectionTitle
                title="Today’s schedule"
                help="Scheduled classes for the gym’s local day. Scheduling is not enabled yet."
              />
            </div>
            <p className="support">20 November 2026</p>
            <div className="empty-state">
              <span className="empty-heading">Room for what’s next</span>
              <p>Classes will appear here when scheduling is enabled.</p>
              <span className="subtle">Classes · Release B</span>
            </div>
          </section>
          <section className="panel">
            <SectionTitle
              title="Upcoming renewals"
              help="Membership periods ending soon in the gym’s local calendar. These are illustrative records, not payment reminders."
            />
            <p className="support">Membership periods ending soon</p>
            {renewals.map(([initials, name, date, days]) => (
              <div className="person-row renewal" key={name}>
                <span className="initials">{initials}</span>
                <span className="person-info">
                  <strong>{name}</strong>
                  <span>Renews {date}</span>
                </span>
                <Pill tone="warning">In {days} days</Pill>
              </div>
            ))}
          </section>
        </div>
        <footer className="main-footer">
          Crown Fitness workspace <span>Asia/Karachi</span>
        </footer>
      </main>
      {drawer ? (
        <Drawer title={drawer} onClose={() => setDrawer(null)}>
          {members.some((m) => m.name === drawer) ? (
            <>
              <p className="drawer-intro">
                Fictional member · no database record
              </p>
              <Table caption="Preview membership">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Plan</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{drawer}</td>
                    <td>{members.find((m) => m.name === drawer)?.plan}</td>
                  </tr>
                </tbody>
              </Table>
            </>
          ) : drawer === "Preview account" ? (
            <>
              <p className="drawer-intro">Account access</p>
              <a href="/sign-in">Sign in to your staff account</a>
              <p>
                No staff session is active in this dashboard preview.
                Organization and branch permissions are being connected.
              </p>
            </>
          ) : (
            <>
              <p className="drawer-intro">Development preview</p>
              <p>
                This workflow is not connected yet. No member, payment, visit or
                class will be created.
              </p>
              {drawer === "Add member" ? (
                <form>
                  <Field label="Full name" placeholder="Member name" disabled />
                  <Field
                    label="Phone number"
                    placeholder="Contact number"
                    disabled
                  />
                  <button className="primary" disabled>
                    Registration unavailable
                  </button>
                </form>
              ) : (
                <p className="notice">
                  Available after the{" "}
                  {drawer === "Record payment"
                    ? "billing"
                    : drawer === "Check in"
                      ? "attendance"
                      : "class scheduling"}{" "}
                  module is implemented.
                </p>
              )}
            </>
          )}
        </Drawer>
      ) : null}
    </PreviewShell>
  );
}
