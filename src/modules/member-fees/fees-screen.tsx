"use client";
import Form from "next/form";
import Link from "next/link";
import { useState } from "react";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { SectionTitle } from "@/components/ui/section-title";
import { ResponsiveTable } from "@/components/responsive-tables";
import { Drawer } from "@/components/ui/primitives";
import { exactMoney } from "@/modules/billing/format";
import type { FeeSchedule } from "./service";
const labels: Record<string, string> = {
  queued: "Queued",
  sending: "Sending",
  sent: "Mail server accepted",
  failed: "Delivery failed",
  uncertain: "Delivery uncertain",
  skipped: "Skipped",
  nothing_due: "No fees due for reminders",
  unavailable: "Add a real owner email and enable summaries first",
  preferences_saved: "Reminder preferences saved",
};
export function FeesScreen({ initial }: { initial: FeeSchedule }) {
  const [data, setData] = useState(initial),
    [enabled, setEnabled] = useState(initial.reminders.enabled),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [retry, setRetry] = useState<
      FeeSchedule["reminders"]["history"][number] | null
    >(null);
  const scope = new URLSearchParams({ organizationId: data.organization.id });
  if (data.branchId) scope.set("branchId", data.branchId);
  const pageURL = (page: number) =>
    "/member-fees?" +
    new URLSearchParams({
      ...Object.fromEntries(scope),
      q: data.query.q,
      status: data.query.status,
      page: String(page),
    });
  const amount = (value: string, currency: string) =>
    exactMoney(value, currency, data.organization.locale);
  async function send(body: Record<string, unknown>) {
    if (blocked) return;
    setBusy(true);
    setError("");
    setNotice("");
    let committed = false;
    try {
      const r = await fetch("/api/member-fees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId: data.organization.id, ...body }),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error?.message ?? "Could not save.");
      committed = true;
      setNotice(labels[result.data.status] ?? result.data.status);
      setRetry(null);
      const fresh = await fetch(
        "/api/member-fees?" +
          new URLSearchParams({
            ...Object.fromEntries(scope),
            q: data.query.q,
            status: data.query.status,
            page: String(data.page),
          }),
        { cache: "no-store" },
      );
      const updated = await fresh.json();
      if (!fresh.ok) throw Error("Could not reload the latest schedule.");
      setData(updated.data);
      setEnabled(updated.data.reminders.enabled);
    } catch (e) {
      if (committed) setBlocked(true);
      setError(
        committed
          ? "Saved. Reload this page before another change because the latest schedule could not be loaded."
          : e instanceof Error
            ? e.message
            : "Could not reach the server. Retry requests reuse the daily summary.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceFrame
      organization={data.organization}
      active="member-fees"
      canManageSettings
      canManageFees
    >
      <div className="page-heading">
        <div>
          <h1>Member fee schedule</h1>
          <p>Individual monthly fees, due dates and owner reminders.</p>
        </div>
        <Link className="button primary" href={"/members?" + scope}>
          Add member
        </Link>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {blocked ? (
        <button className="button secondary" onClick={() => location.reload()}>
          Reload latest schedule
        </button>
      ) : null}
      {notice ? (
        <p className="settings-success" role="status">
          {notice}
        </p>
      ) : null}
      <section className="panel fee-schedule">
        <SectionTitle
          title="Fees & renewals"
          help="An invoice due is an actual unpaid issued balance. A renewal due is the next unissued subscription term, not debt. Saved term dates include freeze extensions and recorded renewals. Cancelled future renewals are excluded; financial history remains on the member profile."
        />
        <Form action="/member-fees" className="class-filters">
          <input
            type="hidden"
            name="organizationId"
            value={data.organization.id}
          />
          <label>
            Search member
            <input
              name="q"
              defaultValue={data.query.q}
              maxLength={100}
              placeholder="Name or member code"
            />
          </label>
          <label>
            Branch
            <select name="branchId" defaultValue={data.branchId}>
              <option value="">All authorized branches</option>
              {data.branches.map((b) => (
                <option value={b.id} key={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fee status
            <select name="status" defaultValue={data.query.status}>
              <option value="due">Upcoming & overdue</option>
              <option value="overdue">Overdue</option>
              <option value="all">All scheduled</option>
            </select>
          </label>
          <button className="button secondary">Apply filters</button>
        </Form>
        <div className="table-scroll">
          <ResponsiveTable aria-label="Member fee schedule">
            <thead>
              <tr>
                <th>Member</th>
                <th>Monthly fee</th>
                <th>Next action</th>
                <th>Due date</th>
                <th>Amount</th>
                <th>Branch</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.memberId}>
                  <td>
                    <Link
                      className="text-action"
                      href={
                        "/members/" +
                        r.memberId +
                        "?organizationId=" +
                        data.organization.id
                      }
                    >
                      <strong>{r.name}</strong>
                    </Link>
                    <small>{r.memberCode}</small>
                  </td>
                  <td>
                    {amount(r.agreedAmountMinor, r.agreedCurrency)}
                    <small>From {r.feeStartOn}</small>
                  </td>
                  <td>
                    <strong>
                      {r.dueKind === "invoice"
                        ? "Invoice balance"
                        : "Renew subscription"}
                    </strong>
                    <small>
                      {r.dueKind === "renewal"
                        ? "Unissued next term"
                        : "Unpaid issued charge"}
                    </small>
                  </td>
                  <td>
                    <strong>{r.dueOn}</strong>
                    <small>
                      {r.dueOn < r.today
                        ? "Overdue"
                        : r.dueOn === r.today
                          ? "Due today"
                          : "Upcoming"}
                    </small>
                  </td>
                  <td>
                    <strong>{amount(r.amountMinor, r.currency)}</strong>
                  </td>
                  <td>{r.branchName}</td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        </div>
        {!data.rows.length ? (
          <p className="dashboard-empty">
            No matching monthly fees. Add an agreed monthly subscription when
            registering a member, or set the next monthly fee during enrollment
            or renewal.
          </p>
        ) : null}
        <div className="class-page-nav">
          <span>
            {data.total} {data.total === 1 ? "member" : "members"} / page{" "}
            {data.page} of {Math.max(1, Math.ceil(data.total / 25))}
          </span>
          {data.page > 1 ? (
            <Link className="button secondary" href={pageURL(data.page - 1)}>
              Previous
            </Link>
          ) : null}
          {data.page * 25 < data.total ? (
            <Link className="button secondary" href={pageURL(data.page + 1)}>
              Next
            </Link>
          ) : null}
        </div>
      </section>
      <section className="panel fee-reminder-settings">
        <SectionTitle
          title="Owner email summaries"
          help="One daily summary per gym is sent through contact@hanovadevs.com to the real owner email. The summary includes all branches and up to 100 reminders, with the complete schedule in Mojym. A mail-server acceptance does not prove inbox delivery. Uncertain deliveries are held for review."
        />
        <p>
          Owner recipient:{" "}
          <strong>
            {data.reminders.ownerEmail ??
              "Not configured - contact your platform administrator"}
          </strong>
        </p>
        <p>
          Scheduled daily. Upcoming reminders begin the member’s chosen number
          of days before due; overdue fees remain visible until paid, renewed or
          corrected.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send({
              operation: "settings",
              enabled,
              version: data.reminders.version,
              reason: "Owner updated daily member fee email preference",
            });
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy || blocked}
              onChange={(e) => setEnabled(e.target.checked)}
            />{" "}
            Email daily member fee summaries
          </label>
          <div className="fee-actions">
            <button
              className="button secondary"
              disabled={busy || blocked || enabled === data.reminders.enabled}
            >
              Save preferences
            </button>
            <button
              className="button primary"
              type="button"
              disabled={
                busy ||
                blocked ||
                !data.reminders.enabled ||
                !data.reminders.ownerEmail
              }
              onClick={() => void send({ operation: "digest" })}
            >
              {busy ? "Please wait..." : "Send today's summary"}
            </button>
          </div>
        </form>
        <div className="table-scroll">
          <ResponsiveTable aria-label="Owner reminder delivery history">
            <thead>
              <tr>
                <th>Summary date</th>
                <th>Delivery status</th>
                <th>Attempts</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.reminders.history.map((h) => (
                <tr key={h.id}>
                  <td>{h.day}</td>
                  <td>
                    <strong>{labels[h.status] ?? h.status}</strong>
                  </td>
                  <td>{h.attempts} of 3</td>
                  <td>
                    {["failed", "uncertain"].includes(h.status) &&
                    h.attempts < 3 ? (
                      <button
                        className="button secondary"
                        disabled={busy || blocked}
                        onClick={() => setRetry(h)}
                      >
                        Review retry
                      </button>
                    ) : (
                      <span>
                        {h.status === "uncertain"
                          ? "Check mailbox before further action"
                          : "No action required"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        </div>
        {!data.reminders.history.length ? (
          <p>No email summaries have been queued yet.</p>
        ) : null}
      </section>
      {retry ? (
        <Drawer
          title="Review reminder retry"
          onClose={() => setRetry(null)}
          busy={busy}
        >
          <p>
            {retry.status === "uncertain"
              ? "The previous attempt may already have reached the mailbox. Review the inbox or mail-server logs first; retrying can send a duplicate."
              : "The previous attempt failed before confirmed acceptance. Review your mail settings before retrying."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void send({
                operation: "retry",
                id: retry.id,
                expectedAttempts: retry.attempts,
                reviewedUncertain: f.get("reviewed") === "on",
                reason: String(f.get("reason")),
              });
            }}
          >
            <fieldset className="drawer-fields" disabled={busy || blocked}>
              {retry.status === "uncertain" ? (
                <label>
                  <input type="checkbox" name="reviewed" required /> I reviewed
                  delivery and accept the possibility of a duplicate
                </label>
              ) : null}
              <label>
                Reason
                <input name="reason" required minLength={3} maxLength={300} />
              </label>
              <button className="button primary">Confirm retry</button>
            </fieldset>
          </form>
        </Drawer>
      ) : null}
    </WorkspaceFrame>
  );
}
