"use client";
import Link from "next/link";
import Form from "next/form";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { SectionTitle } from "@/components/ui/section-title";
import { exactMoney } from "@/modules/billing/format";
import type { DashboardData } from "./types";

export function DashboardScreen({ data }: { data: DashboardData }) {
  const router = useRouter(),
    [refreshing, startTransition] = useTransition();
  const scope = new URLSearchParams({ organizationId: data.organization.id });
  if (data.branchId) scope.set("branchId", data.branchId);
  const href = (path: string) => path + "?" + scope;
  const profile = (id: string) =>
    `/members/${id}?organizationId=${data.organization.id}`;
  const date = (value: string, weekday = false) =>
    new Intl.DateTimeFormat(
      data.organization.locale,
      weekday
        ? { weekday: "short", timeZone: "UTC" }
        : { dateStyle: "medium", timeZone: "UTC" },
    ).format(new Date(value + "T12:00:00Z"));
  const money = (value: string, currency: string) =>
    (BigInt(value) < 0n ? "−" : "") +
    exactMoney(
      BigInt(value) < 0n ? (-BigInt(value)).toString() : value,
      currency,
      data.organization.locale,
    );
  const max = Math.max(
    1,
    ...(data.operational?.week.map((d) => d.visits) ?? []),
  );
  return (
    <WorkspaceFrame
      organization={data.organization}
      active="dashboard"
      canManageSettings={data.canManageSettings}
      canManageMembers={data.canManageMembers}
      canReadPlans={data.canReadPlans}
      canReadBilling={data.canReadBilling}
    >
      <section className="page-heading dashboard-heading">
        <div>
          <h1>Gym overview</h1>
          <p>Here’s what’s happening at {data.organization.name}.</p>
        </div>
        <button
          disabled={refreshing}
          onClick={() => startTransition(() => router.refresh())}
        >
          {refreshing ? "Refreshing…" : "Refresh overview"}
        </button>
      </section>
      <Form action="/dashboard" className="dashboard-filters">
        <input
          type="hidden"
          name="organizationId"
          value={data.organization.id}
        />
        <label className="field">
          Branch scope
          <select
            aria-label="Branch scope"
            name="branchId"
            defaultValue={data.branchId}
          >
            <option value="">All permitted branches</option>
            {data.branches.map((b) => (
              <option value={b.id} key={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Apply branch</button>
        <p>
          {date(data.today)} · {data.organization.timeZone}
        </p>
      </Form>
      <div className="dashboard-metrics" aria-busy={refreshing}>
        {data.operational ? (
          <>
            <section className="panel">
              <SectionTitle
                title="Active members"
                help="Distinct non-archived members with an activated, current membership in this home-branch scope. Frozen and effective cancellations are excluded. Grace and unpaid debt do not redefine active membership."
              />
              <p className="dashboard-number" data-testid="active-members">
                {data.operational.activeMembers}
              </p>
              <Link href={href("/members")}>Open member directory</Link>
            </section>
            <section className="panel">
              <SectionTitle
                title="Today’s check-ins"
                help="Successful visit openings today in the gym’s local time zone. Repeated visits after checkout count; duplicate scans do not."
              />
              <p className="dashboard-number" data-testid="today-visits">
                {data.operational.checkIns}
              </p>
              <Link href={href("/attendance")}>
                {data.operational.inside} currently inside
              </Link>
              {data.operational.stale ? (
                <p>{data.operational.stale} open from earlier days</p>
              ) : null}
            </section>
          </>
        ) : null}
        <section className="panel">
          <SectionTitle
            title={
              data.finance.period === "today"
                ? "Collected today"
                : "Collected this month"
            }
            help={`Payments received minus refunds by cash date, from ${date(data.finance.fromOn)} through ${date(data.today)}. Credit-only adjustments are not cash. Each currency is separate; this is not profit.`}
          />
          {data.finance.collections.length ? (
            data.finance.collections.map((c) => (
              <div key={c.currency}>
                <p
                  className="dashboard-number dashboard-money"
                  data-testid={`net-${c.currency}`}
                >
                  {money(c.netMinor, c.currency)}
                </p>
                <p>
                  {money(c.receivedMinor, c.currency)} received ·{" "}
                  {money(c.refundedMinor, c.currency)} refunded
                </p>
              </div>
            ))
          ) : (
            <p className="dashboard-empty">No collections in this period.</p>
          )}
          <Link href={href("/payments")}>View payments</Link>
        </section>
        <section className="panel">
          <SectionTitle
            title="Overdue invoices"
            help="Issued invoices with a positive current balance and a due date before today in the gym’s local calendar. Invoice amounts remain attributed to their original branch."
          />
          <p className="dashboard-number" data-testid="overdue-count">
            {data.finance.overdueCount}
          </p>
          <Link href={href("/payments") + "&status=overdue"}>
            Review overdue invoices
          </Link>
        </section>
      </div>
      <div className="dashboard-middle">
        {data.operational ? (
          <section className="panel dashboard-activity">
            <SectionTitle
              title="Member activity"
              help="Successful visit openings by local calendar day over the last seven days, including today. Counts reconcile to attendance history for this branch scope."
            />
            <p className="dashboard-caption">Last seven days · visits</p>
            <ol
              className="dashboard-chart"
              aria-label="Daily check-ins for the last seven days"
            >
              {data.operational.week.map((d) => (
                <li key={d.day}>
                  <span>{d.visits}</span>
                  <div className="dashboard-bar-space" aria-hidden="true">
                    <div
                      className="dashboard-bar"
                      style={{ height: `${(d.visits / max) * 100}%` }}
                    />
                  </div>
                  <span>
                    <span className="sr-only">{date(d.day)}: </span>
                    {date(d.day, true)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        <section className="panel">
          <SectionTitle
            title="Quick actions"
            help="Open a protected workflow in the current gym and branch scope. Every action checks your current permissions again."
          />
          <div className="dashboard-actions">
            {data.canManageMembers ? (
              <>
                <Link href={href("/members")}>Register a member</Link>
                <Link href={href("/attendance")}>Check in a member</Link>
              </>
            ) : null}
            <Link href={href("/payments")}>Record a payment</Link>
            {data.canReadPlans ? (
              <Link href={href("/plans")}>View membership plans</Link>
            ) : null}
          </div>
        </section>
      </div>
      {data.operational ? (
        <div className="dashboard-bottom">
          <section className="panel">
            <SectionTitle
              title="Recent members"
              help="The six most recently registered non-archived members in this home-branch scope. Registration does not imply an active paid membership."
            />
            <ul className="dashboard-member-list">
              {data.operational.recentMembers.map((m) => (
                <li key={m.id}>
                  <Link href={profile(m.id)}>
                    <strong>{m.name}</strong>
                    <span>
                      {m.memberCode} · Joined {date(m.joinedOn)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {!data.operational.recentMembers.length ? (
              <p className="dashboard-empty">
                No members registered in this scope.
              </p>
            ) : null}
            <Link href={href("/members")}>View all members</Link>
          </section>
          <section className="panel">
            <SectionTitle
              title="Upcoming renewals"
              help="Up to eight active members whose period ends within fourteen days, without an adjacent renewal already recorded. The date shown is the first day requiring renewal, not the last inclusive access day."
            />
            <ul className="dashboard-member-list">
              {data.operational.renewals.map((m) => (
                <li key={m.id}>
                  <Link href={profile(m.id)}>
                    <strong>{m.name}</strong>
                    <span>
                      {m.memberCode} · Renew on {date(m.renewOn)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {!data.operational.renewals.length ? (
              <p className="dashboard-empty">
                No upcoming renewals in the next fourteen days.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
      {data.finance.outstanding ? (
        <section className="panel dashboard-outstanding">
          <SectionTitle
            title="Outstanding balances"
            help="Positive issued-invoice balances across all due dates in the selected original-branch scope, net of payments, refunds and credit corrections. These are receivables, not cash collections."
          />
          {data.finance.outstanding.length ? (
            <ul>
              {data.finance.outstanding.map((c) => (
                <li key={c.currency}>
                  <strong>{money(c.amountMinor, c.currency)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>No outstanding issued invoices in this scope.</p>
          )}
        </section>
      ) : null}
    </WorkspaceFrame>
  );
}
