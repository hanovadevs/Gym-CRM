import Link from "next/link";
import Form from "next/form";
import { BrandMark } from "@/components/brand";
import { SignOut } from "@/components/sign-out";
import { SectionTitle } from "@/components/ui/section-title";
import { Pill, Table } from "@/components/ui/primitives";
import { exactMoney } from "@/modules/billing/format";
import type { GymAnalytics } from "./analytics";
function money(value: string, currency: string, locale: string) {
  const n = BigInt(value);
  return (
    (n < 0n ? "−" : "") +
    exactMoney(n < 0n ? (-n).toString() : value, currency, locale)
  );
}
export function GymAnalyticsScreen({ data }: { data: GymAnalytics }) {
  const peak = Math.max(1, ...data.daily.map((d) => d.visits));
  return (
    <div className="platform-layout">
      <header className="platform-header">
        <Link href="/admin" className="brand">
          <span className="brand-mark">
            <BrandMark />
          </span>
          Mojym
        </Link>
        <span>Platform administration</span>
        <SignOut />
      </header>
      <main className="platform-main gym-analytics">
        <Link className="text-action" href="/admin">
          Back to gym directory
        </Link>
        <Link
          className="text-action"
          href={"/admin/gyms/" + data.organization.id + "/billing"}
        >
          Manage monthly platform fees
        </Link>
        <section className="page-heading">
          <div>
            <p className="eyebrow">Gym analytics</p>
            <h1>{data.organization.name}</h1>
            <p>
              Operational health and financial summaries across your selected
              period.
            </p>
          </div>
          <Pill tone={data.organization.active ? "success" : "warning"}>
            {data.organization.active
              ? "Active workspace"
              : "Suspended workspace"}
          </Pill>
        </section>
        {!data.organization.active ? (
          <p className="analytics-notice">
            Staff access is suspended. Records and membership dates are
            retained; suspension does not cancel memberships or reverse
            payments.
          </p>
        ) : null}
        <Form
          action={"/admin/gyms/" + data.organization.id}
          className="analytics-filters"
        >
          <label className="field">
            Branch
            <select
              aria-label="Branch"
              name="branchId"
              defaultValue={data.branchId}
            >
              <option value="">All branches</option>
              {data.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            From
            <input
              type="date"
              name="from"
              aria-label="From"
              defaultValue={data.from}
              max={data.to}
              required
            />
          </label>
          <label className="field">
            Through
            <input
              type="date"
              name="to"
              aria-label="Through"
              defaultValue={data.to}
              max={data.today}
              required
            />
          </label>
          <button type="submit">Update analytics</button>
        </Form>
        <p className="analytics-caption">
          Dates use {data.organization.timeZone}. Period: {data.from} through{" "}
          {data.to}. Current-state metrics are measured today ({data.today}).
        </p>
        <div className="analytics-metrics">
          <section className="panel">
            <SectionTitle
              title="Registered members"
              help="Non-archived members currently assigned to the selected home branch. These are directory records, not necessarily paid or admitted members."
            />
            <strong>{data.members.registered}</strong>
            <p>
              {data.members.total} total records · {data.members.archived}{" "}
              archived
            </p>
          </section>
          <section className="panel">
            <SectionTitle
              title="Current member terms"
              help="Distinct members with activated terms covering today; archived, frozen and effectively cancelled terms are excluded. Debt and gym suspension are separate access checks."
            />
            <strong>{data.members.currentTerms}</strong>
            <p>{data.members.renewals} due for renewal within 14 days</p>
          </section>
          <section className="panel">
            <SectionTitle
              title="Visits in period"
              help="Actual visit openings during the selected gym-local calendar dates. Repeat visits after checkout count separately; duplicate scans do not."
            />
            <strong>{data.attendance.visits}</strong>
            <p>
              {data.attendance.uniqueVisitors} distinct visitors ·{" "}
              {data.attendance.inside} currently inside
            </p>
          </section>
          <section className="panel">
            <SectionTitle
              title="New registrations"
              help="Records created during this period, attributed to their current home branch. The registration timestamp is used, rather than an editable joining date."
            />
            <strong>{data.members.newRegistrations}</strong>
            <p>
              {data.administration.activeStaff} active staff ·{" "}
              {data.administration.activeBranches} active branches
            </p>
          </section>
        </div>
        <section className="panel analytics-finance">
          <SectionTitle
            title="Financial overview"
            help="Period cash receipts less cash refunds, and expense postings less expense reversals, using each event's actual cash date and original branch. Credits are noncash. Outstanding and overdue are current issued balances, not period receipts. Currencies remain separate; net cash is not accounting profit."
          />
          {data.finances.length ? (
            <Table caption="Gym financial summaries by currency">
              <thead>
                <tr>
                  <th>Currency</th>
                  <th>Issued charges</th>
                  <th>Collected</th>
                  <th>Refunded</th>
                  <th>Net collected</th>
                  <th>Net expenses</th>
                  <th>Net cash</th>
                  <th>Outstanding now</th>
                  <th>Overdue now</th>
                </tr>
              </thead>
              <tbody>
                {data.finances.map((f) => (
                  <tr key={f.currency}>
                    <td>
                      <strong>{f.currency}</strong>
                    </td>
                    <td>
                      {money(
                        f.invoicedMinor,
                        f.currency,
                        data.organization.locale,
                      )}
                    </td>
                    <td>
                      {money(
                        f.receivedMinor,
                        f.currency,
                        data.organization.locale,
                      )}
                    </td>
                    <td>
                      {money(
                        f.refundedMinor,
                        f.currency,
                        data.organization.locale,
                      )}
                    </td>
                    <td>
                      {money(
                        f.netCollectedMinor,
                        f.currency,
                        data.organization.locale,
                      )}
                    </td>
                    <td>
                      {money(
                        f.netExpenseMinor,
                        f.currency,
                        data.organization.locale,
                      )}
                      <small>
                        {money(
                          f.reversedExpenseMinor,
                          f.currency,
                          data.organization.locale,
                        )}{" "}
                        reversed
                      </small>
                    </td>
                    <td>
                      {money(
                        f.netCashMinor,
                        f.currency,
                        data.organization.locale,
                      )}
                    </td>
                    <td>
                      {money(
                        f.outstandingMinor,
                        f.currency,
                        data.organization.locale,
                      )}
                    </td>
                    <td>
                      {money(
                        f.overdueMinor,
                        f.currency,
                        data.organization.locale,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="analytics-empty">
              No financial postings or outstanding balances for these filters.
            </p>
          )}
          <p className="analytics-caption">
            {data.administration.draftInvoices} draft invoices are unissued and
            excluded from debt. Issued charges, collections and cash flow are
            different measures.
          </p>
        </section>
        <div className="analytics-lower">
          <section className="panel">
            <SectionTitle
              title="Daily attendance"
              help="Actual check-ins for the last 31 calendar days within your selected range. The totals above cover the entire selected period."
            />
            <ol className="analytics-daily">
              {data.daily.map((d) => (
                <li key={d.day}>
                  <time dateTime={d.day}>{d.day.slice(5)}</time>
                  <span className="analytics-bar-space">
                    <span
                      style={{
                        width: Math.round((d.visits / peak) * 100) + "%",
                      }}
                    />
                  </span>
                  <strong>{d.visits}</strong>
                </li>
              ))}
            </ol>
          </section>
          <section className="panel">
            <SectionTitle
              title="Registration activity"
              help="New member records by actual creation date for the same displayed days. Archived members remain included in historical registrations. No member identities or private notes are exposed."
            />
            <details>
              <summary>View daily registration counts</summary>
              <Table caption="Daily registrations">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((d) => (
                    <tr key={d.day}>
                      <td>{d.day}</td>
                      <td>{d.registrations}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </details>
            <p className="analytics-caption">
              Average completed visit:{" "}
              {data.attendance.averageSeconds === null
                ? "No completed visits in this period"
                : Math.round(data.attendance.averageSeconds / 60) + " minutes"}
              . Open visits are excluded.
            </p>
          </section>
        </div>
        <Link
          className="text-action"
          href={
            "/admin?organizationId=" + data.organization.id + "#gym-activity"
          }
        >
          Review recorded gym activity
        </Link>
        <p className="analytics-caption">
          Snapshot generated{" "}
          {new Date(data.generatedAt)
            .toISOString()
            .replace("T", " ")
            .slice(0, 19)}{" "}
          UTC. Refresh or update filters to request current data.
        </p>
      </main>
    </div>
  );
}
