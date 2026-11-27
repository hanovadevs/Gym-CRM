"use client";
import Form from "next/form";
import Link from "next/link";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { SectionTitle } from "@/components/ui/section-title";
import { Table } from "@/components/ui/primitives";
import { exactMoney } from "@/modules/billing/format";
import type { ReportsData } from "./service";
import styles from "./styles.module.css";
export function ReportsScreen({
  data: d,
  print,
}: {
  data: ReportsData;
  print: boolean;
}) {
  const query = new URLSearchParams(
    Object.entries(d.query)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
  const url = (path: string, extra: Record<string, string> = {}) => {
    const q = new URLSearchParams(query);
    Object.entries(extra).forEach(([k, v]) => q.set(k, v));
    return path + "?" + q;
  };
  const financial = d.query.report === "collections";
  const content = (
    <div className={styles.reports}>
      <section className="page-heading">
        <div>
          <h1>Reports</h1>
          <p>
            {d.organization.name} · {d.query.from} – {d.query.to} ·{" "}
            {d.organization.timeZone}
          </p>
          <p>
            {d.query.report === "collections"
              ? "Collections & cash flow"
              : d.query.report === "memberships"
                ? "Memberships"
                : "Attendance"}{" "}
            ·{" "}
            {d.query.branchId
              ? d.branches.find((b) => b.id === d.query.branchId)?.name
              : "All authorized branches"}
          </p>
        </div>
        <div className={styles.actions}>
          <a className="button secondary" href={url("/api/reports/export")}>
            Download CSV
          </a>
          {print ? (
            <button onClick={() => window.print()}>Print report</button>
          ) : (
            <Link
              className="button primary"
              href={url("/reports", { print: "1" })}
            >
              Print preview
            </Link>
          )}
        </div>
      </section>
      {print ? (
        <Link className={styles.back} href={url("/reports")}>
          Back to reports
        </Link>
      ) : (
        <Form action="/reports" className={styles.filters}>
          <input
            type="hidden"
            name="organizationId"
            value={d.organization.id}
          />
          <label>
            Report
            <select
              aria-label="Report"
              name="report"
              defaultValue={d.query.report}
            >
              <option value="collections">Collections & cash flow</option>
              <option value="memberships">Memberships</option>
              <option value="attendance">Attendance</option>
            </select>
          </label>
          <label>
            Branch
            <select
              aria-label="Branch"
              name="branchId"
              defaultValue={d.query.branchId ?? ""}
            >
              <option value="">All authorized branches</option>
              {d.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              name="from"
              required
              defaultValue={d.query.from}
            />
          </label>
          <label>
            Through
            <input type="date" name="to" required defaultValue={d.query.to} />
          </label>
          <button className="primary">Apply filters</button>
        </Form>
      )}
      <section className="panel">
        <SectionTitle
          title={financial ? "Cash reconciliation" : "Period summary"}
          help={
            financial
              ? "Payments less refunds, then expenses less reversals. Each event uses its own cash date and original branch. Currency totals remain separate."
              : "Membership status uses the period end using current activation and archival records. Attendance counts visits opened in the gym-local date range. Renewal cohorts include one latest ending per member and require seven days of observation."
          }
        />
        <div className={styles.metrics}>
          {d.summary.map((s, i) => (
            <div key={i}>
              {Object.entries(s).map(([label, value]) => (
                <div key={label}>
                  <span>
                    {{
                      currency: "Currency",
                      received: "Received",
                      refunded: "Refunded",
                      expenses: "Posted expenses",
                      reversals: "Expense reversals",
                      netCollections: "Net collections",
                      netExpenses: "Net expenses",
                      netCash: "Net cash flow",
                    }[label] ?? label}
                  </span>
                  <strong>
                    {financial && label !== "currency"
                      ? (BigInt(value) < 0n ? "-" : "") +
                        exactMoney(
                          (BigInt(value) < 0n
                            ? -BigInt(value)
                            : BigInt(value)
                          ).toString(),
                          s.currency,
                          "en-PK",
                        )
                      : value}
                  </strong>
                </div>
              ))}
            </div>
          ))}
        </div>
        {!d.summary.length && <p>No cash movements in this period.</p>}
        <p className="support">
          {financial
            ? "Net collections = received − refunded. Net expenses = expenses − reversals. Net cash flow = net collections − net expenses."
            : d.query.report === "memberships"
              ? "Terms overlapping the period are listed. Active members exclude archived and frozen members. Renewal rate uses renewed members / ended-member cohort and is provisional while any seven-day observation window remains open."
              : "Open visits have no final duration. Average duration includes closed visits only. Unique visitors count each member once within the selected branches."}
        </p>
      </section>
      <section className="panel">
        <SectionTitle
          title="Source records"
          help="The records and summaries come from one database statement. CSV and print include the full selected range, up to 10,000 rows. Narrow filters when that limit is exceeded."
        />
        <p>
          {d.total} records · Generated {d.generatedAt}
        </p>
        <Table caption={d.query.report + " report"}>
          <thead>
            <tr>
              {d.headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.id}>
                {r.values.map((v, i) => (
                  <td key={i}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
        {!d.rows.length && (
          <p>No matching records. Try another date range or branch.</p>
        )}
        {!print && (
          <nav className={styles.actions} aria-label="Report pages">
            {d.page > 1 && (
              <Link href={url("/reports", { page: String(d.page - 1) })}>
                Previous
              </Link>
            )}
            <span>Page {d.page}</span>
            {d.page * 50 < d.total && (
              <Link href={url("/reports", { page: String(d.page + 1) })}>
                Next
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
  if (print) return <main className={styles.print}>{content}</main>;
  return (
    <WorkspaceFrame
      organization={d.organization}
      active="reports"
      canManageSettings={d.canManageSettings}
      canManageMembers={d.canManageMembers}
      canReadPlans={true}
      canReadBilling={true}
    >
      {content}
    </WorkspaceFrame>
  );
}
