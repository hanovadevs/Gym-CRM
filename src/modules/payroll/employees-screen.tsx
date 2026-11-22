"use client";
import { useState } from "react";
import Link from "next/link";
import Form from "next/form";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { Drawer, Table, Pill } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/section-title";
import { useHydrated } from "@/lib/use-hydrated";
import { exactMoney } from "@/modules/billing/format";
import { parseAmount, amountInput } from "@/modules/plans/format";
import type {
  PayrollData,
  Employee,
  PayrollCharge,
  PayrollPayment,
} from "./types";
type Action = {
  operation: "employee" | "charge" | "payment" | "void" | "reverse";
  employee?: Employee;
  charge?: PayrollCharge;
  payment?: PayrollPayment;
};
function status(c: PayrollCharge, today: string) {
  return c.voided
    ? "Void"
    : c.balanceMinor === "0"
      ? "Paid"
      : c.dueOn < today
        ? "Overdue"
        : c.paidMinor !== "0"
          ? "Partially paid"
          : "Unpaid";
}
export function EmployeesScreen({ initial }: { initial: PayrollData }) {
  const [data, setData] = useState(initial),
    [action, setAction] = useState<Action | null>(null),
    [blocked, setBlocked] = useState(false),
    [error, setError] = useState("");
  const hydrated = useHydrated(),
    locked = !hydrated || blocked;
  const money = (value: string, currency: string) =>
      exactMoney(value, currency, data.organization.locale),
    selected = data.selected,
    c = data.selectedCharge;
  function href(changes: Record<string, string | number | undefined>) {
    const q: Record<string, string | number | undefined> = {
      organizationId: data.organization.id,
      branchId: data.branchId || undefined,
      q: data.q || undefined,
      page: data.page,
      employeeId: selected?.id,
      chargeId: c?.id,
      chargePage: data.chargePage,
      paymentPage: data.paymentPage,
      ...changes,
    };
    return (
      "/employees?" +
      new URLSearchParams(
        Object.entries(q)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      )
    );
  }
  return (
    <WorkspaceFrame
      organization={data.organization}
      active="employees"
      canManageSettings={data.canManageSettings}
      canManageMembers={data.canManageMembers}
      canReadPlans={data.canReadPlans}
      canReadBilling={data.canReadBilling}
    >
      <div className="employee-sections">
        <section className="page-heading">
          <div>
            <h1>Employees & salaries</h1>
            <p>Your team, monthly salary dues and payment history.</p>
          </div>
          {data.canManageEmployees ? (
            <button
              className="primary"
              disabled={locked}
              onClick={() => setAction({ operation: "employee" })}
            >
              Add employee
            </button>
          ) : null}
        </section>
        {error ? (
          <p role="alert" className="form-error">
            {error}
            <button onClick={() => location.reload()}>Reload payroll</button>
          </p>
        ) : null}
        <section className="panel">
          <SectionTitle
            title="Salary balances"
            help="Monthly dues are recorded explicitly from the agreed salary. Payments post once to Staff salaries in Expenses. Reversing an expense reopens the salary balance. Inactive employees and historical rates remain in history."
          />
          {data.summary.length ? (
            <div className="fee-totals">
              {data.summary.map((s) => (
                <dl key={s.currency}>
                  <dt>{s.currency} salary due</dt>
                  <dd>{money(s.chargedMinor, s.currency)}</dd>
                  <dt>Net paid</dt>
                  <dd>{money(s.paidMinor, s.currency)}</dd>
                  <dt>Remaining</dt>
                  <dd>{money(s.balanceMinor, s.currency)}</dd>
                </dl>
              ))}
            </div>
          ) : (
            <p>No salary dues recorded in this branch selection.</p>
          )}
        </section>
        <section className="panel">
          <SectionTitle
            title="Employee directory"
            help="Employee records are separate from staff access. Optionally link a trainer profile; this creates no sign-in account. Salary details are restricted to owners, managers and accountants."
          />
          <Form action="/employees" className="trainer-filters">
            <input
              type="hidden"
              name="organizationId"
              value={data.organization.id}
            />
            <label>
              Find employee
              <input
                name="q"
                defaultValue={data.q}
                placeholder="Name or job title"
                maxLength={100}
              />
            </label>
            <label>
              Branch
              <select
                name="branchId"
                aria-label="Branch"
                defaultValue={data.branchId}
              >
                <option value="">All authorized branches</option>
                {data.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Search</button>
          </Form>
          <Table caption="Gym employees">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role / branch</th>
                <th>Monthly salary</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.name}</strong>
                    <small className="table-secondary">
                      {e.email || e.phone || "No contact supplied"}
                    </small>
                  </td>
                  <td>
                    {e.title}
                    <small className="table-secondary">{e.branchName}</small>
                  </td>
                  <td>
                    {e.salaryMinor
                      ? money(e.salaryMinor, e.currency)
                      : "Not configured"}
                  </td>
                  <td>
                    <Pill tone={e.active ? "success" : "warning"}>
                      {e.active ? "Active" : "Inactive"}
                    </Pill>
                  </td>
                  <td>
                    <Link
                      href={href({
                        employeeId: e.id,
                        chargeId: undefined,
                        chargePage: 1,
                        paymentPage: 1,
                      })}
                    >
                      Manage {e.name}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!data.rows.length ? <p>No employees match this selection.</p> : null}
          <nav className="pagination" aria-label="Employee pages">
            <span>
              {data.total} employees / Page {data.page}
            </span>
            {data.page > 1 ? (
              <Link
                href={href({
                  page: data.page - 1,
                  employeeId: undefined,
                  chargeId: undefined,
                })}
              >
                Previous employees
              </Link>
            ) : null}
            {data.page * 25 < data.total ? (
              <Link
                href={href({
                  page: data.page + 1,
                  employeeId: undefined,
                  chargeId: undefined,
                })}
              >
                Next employees
              </Link>
            ) : null}
          </nav>
        </section>
        {selected ? (
          <>
            <section className="panel">
              <SectionTitle
                title={selected.name}
                help="Profile changes affect future salary entries. Existing monthly salary snapshots, original branches and payments remain unchanged."
              />
              <dl className="review-list">
                <dt>Job title</dt>
                <dd>{selected.title}</dd>
                <dt>Branch</dt>
                <dd>{selected.branchName}</dd>
                <dt>Started</dt>
                <dd>{selected.startOn}</dd>
                <dt>Contact</dt>
                <dd>
                  {[selected.phone, selected.email]
                    .filter(Boolean)
                    .join(" / ") || "Not provided"}
                </dd>
                <dt>Current monthly rate</dt>
                <dd>
                  {selected.salaryMinor
                    ? money(selected.salaryMinor, selected.currency)
                    : "Not configured"}
                </dd>
                <dt>Monthly pay day</dt>
                <dd>{selected.payDay}</dd>
                <dt>Trainer profile</dt>
                <dd>
                  {selected.trainerId
                    ? "Linked coaching profile"
                    : "Employee only"}
                </dd>
              </dl>
              <div className="platform-heading-actions">
                {data.canManageEmployees ? (
                  <button
                    disabled={locked}
                    onClick={() =>
                      setAction({ operation: "employee", employee: selected })
                    }
                  >
                    Edit employee
                  </button>
                ) : null}
                <button
                  className="primary"
                  disabled={locked || !selected.active}
                  onClick={() =>
                    setAction({ operation: "charge", employee: selected })
                  }
                >
                  Record monthly salary
                </button>
              </div>
            </section>
            <section className="panel">
              <SectionTitle
                title="Monthly salary history"
                help="One active salary entry per employee per month. Use the agreed rate or enter an explained adjustment. Reverse all retained payments before voiding an incorrect entry."
              />
              <Table caption="Monthly salary ledger">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Due</th>
                    <th>Salary</th>
                    <th>Paid</th>
                    <th>Remaining</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.charges.map((row) => (
                    <tr key={row.id}>
                      <td>{row.period.slice(0, 7)}</td>
                      <td>{row.dueOn}</td>
                      <td>{money(row.amountMinor, row.currency)}</td>
                      <td>{money(row.paidMinor, row.currency)}</td>
                      <td>{money(row.balanceMinor, row.currency)}</td>
                      <td>{status(row, data.organization.today)}</td>
                      <td>
                        <Link href={href({ chargeId: row.id, paymentPage: 1 })}>
                          View payments
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {!data.charges.length ? (
                <p>
                  No monthly salary entry has been recorded for this employee.
                </p>
              ) : null}
              <nav className="pagination" aria-label="Salary history pages">
                <span>
                  {data.chargeTotal} salary entries / Page {data.chargePage}
                </span>
                {data.chargePage > 1 ? (
                  <Link
                    href={href({
                      chargePage: data.chargePage - 1,
                      chargeId: undefined,
                    })}
                  >
                    Previous salaries
                  </Link>
                ) : null}
                {data.chargePage * 25 < data.chargeTotal ? (
                  <Link
                    href={href({
                      chargePage: data.chargePage + 1,
                      chargeId: undefined,
                    })}
                  >
                    Next salaries
                  </Link>
                ) : null}
              </nav>
            </section>
            {c ? (
              <section className="panel">
                <SectionTitle
                  title={"Salary payments for " + c.period.slice(0, 7)}
                  help="Each payment is an immutable cash expense. Full reversal retains the original record and reopens the unpaid amount. Bank transfers need a reference."
                />
                <p>
                  {status(c, data.organization.today)} / Remaining{" "}
                  {money(c.balanceMinor, c.currency)}
                </p>
                <div className="platform-heading-actions">
                  <button
                    className="primary"
                    disabled={locked || c.voided || c.balanceMinor === "0"}
                    onClick={() =>
                      setAction({ operation: "payment", charge: c })
                    }
                  >
                    Record salary payment
                  </button>
                  {!c.voided && c.paidMinor === "0" ? (
                    <button
                      disabled={locked}
                      onClick={() =>
                        setAction({ operation: "void", charge: c })
                      }
                    >
                      Void salary entry
                    </button>
                  ) : null}
                </div>
                {c.voided ? <p>Voided: {c.voidReason}</p> : null}
                <Table caption="Salary payments">
                  <thead>
                    <tr>
                      <th>Paid</th>
                      <th>Expense</th>
                      <th>Amount</th>
                      <th>Method / reference</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.paidOn}</td>
                        <td>{p.number}</td>
                        <td>{money(p.amountMinor, p.currency)}</td>
                        <td>
                          {p.method}
                          <small className="table-secondary">
                            {p.reference}
                          </small>
                        </td>
                        <td>
                          {p.reversed ? "Reversed" : "Recorded"}
                          {p.reversed ? (
                            <small className="table-secondary">
                              {p.reversalReason}
                            </small>
                          ) : null}
                        </td>
                        <td>
                          {!p.reversed ? (
                            <button
                              disabled={locked}
                              onClick={() =>
                                setAction({
                                  operation: "reverse",
                                  charge: c,
                                  payment: p,
                                })
                              }
                            >
                              Reverse salary payment
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {!data.payments.length ? (
                  <p>No payments recorded for this salary entry.</p>
                ) : null}
                <nav className="pagination" aria-label="Salary payment pages">
                  <span>
                    {data.paymentTotal} payments / Page {data.paymentPage}
                  </span>
                  {data.paymentPage > 1 ? (
                    <Link href={href({ paymentPage: data.paymentPage - 1 })}>
                      Previous payments
                    </Link>
                  ) : null}
                  {data.paymentPage * 25 < data.paymentTotal ? (
                    <Link href={href({ paymentPage: data.paymentPage + 1 })}>
                      Next payments
                    </Link>
                  ) : null}
                </nav>
              </section>
            ) : null}
          </>
        ) : null}
        {action ? (
          <PayrollEditor
            action={action}
            data={data}
            onClose={() => setAction(null)}
            saved={async (result) => {
              try {
                const keepCharge =
                  result.chargeId ??
                  (result.employeeId === undefined ||
                  result.employeeId === selected?.id
                    ? c?.id
                    : undefined);
                const r = await fetch(
                  "/api/payroll?" +
                    new URLSearchParams({
                      organizationId: data.organization.id,
                      employeeId: String(result.employeeId ?? selected?.id),
                      ...(keepCharge ? { chargeId: String(keepCharge) } : {}),
                    }),
                  { cache: "no-store" },
                );
                const v = await r.json();
                if (!r.ok || !v.ok)
                  throw Error(
                    "Payroll saved, but the ledger could not refresh. Reload before another change.",
                  );
                setData(v.data);
              } catch (e) {
                setBlocked(true);
                setError(
                  e instanceof Error
                    ? e.message
                    : "Reload payroll to see the saved change.",
                );
                throw e;
              }
            }}
          />
        ) : null}
      </div>
    </WorkspaceFrame>
  );
}
function PayrollEditor({
  action,
  data,
  onClose,
  saved,
}: {
  action: Action;
  data: PayrollData;
  onClose: () => void;
  saved: (r: Record<string, unknown>) => Promise<void>;
}) {
  const [key] = useState(() => crypto.randomUUID()),
    [id] = useState(() => action.employee?.id ?? crypto.randomUUID()),
    [prepared, setPrepared] = useState<Record<string, unknown> | null>(null),
    [pending, setPending] = useState(false),
    [attempted, setAttempted] = useState(false),
    [blocked, setBlocked] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const employee = action.employee ?? data.selected,
    charge = action.charge,
    payment = action.payment,
    isEmployee = action.operation === "employee",
    isCharge = action.operation === "charge",
    isPayment = action.operation === "payment",
    isReverse = action.operation === "reverse",
    currency = employee?.currency ?? data.organization.currency,
    month = data.organization.today.slice(0, 7);
  const title = isEmployee
    ? action.employee
      ? "Edit employee"
      : "Add employee"
    : isCharge
      ? "Record monthly salary"
      : isPayment
        ? "Record salary payment"
        : isReverse
          ? "Reverse salary payment"
          : "Void salary entry";
  async function confirm() {
    if (!prepared || pending || blocked) return;
    setPending(true);
    setAttempted(true);
    setError("");
    try {
      const r = await fetch(
        isReverse
          ? "/api/expenses/" + payment?.expenseId + "/reverse"
          : "/api/payroll",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(prepared),
        },
      );
      const v = await r.json();
      if (!r.ok || !v.ok) {
        if (r.status === 409 || r.status === 403) setBlocked(true);
        else if (r.status === 422) {
          setPrepared(null);
          setAttempted(false);
        }
        throw Error(v.error?.message ?? "Unable to save payroll.");
      }
      setDone(true);
      await saved(v.data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to reach the server. Retry the same reviewed request.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Drawer title={title} onClose={onClose} busy={pending}>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {done ? (
        <section>
          <h3>Payroll saved</h3>
          <p>The entry and audit history were saved together.</p>
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </section>
      ) : (
        <>
          <form
            className="invoice-form"
            hidden={!!prepared}
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                const base = {
                  organizationId: data.organization.id,
                  requestKey: key,
                  reason: String(f.get("reason")),
                };
                let value: Record<string, unknown>;
                if (isEmployee) {
                  const raw = String(f.get("salary"));
                  value = {
                    ...base,
                    operation: "employee",
                    id,
                    ...(action.employee
                      ? { version: action.employee.version }
                      : {}),
                    name: f.get("name"),
                    title: f.get("title"),
                    branchId: f.get("branchId"),
                    trainerId: f.get("trainerId") || null,
                    phone: f.get("phone"),
                    email: f.get("email"),
                    startOn: f.get("startOn"),
                    active: f.get("active") === "on",
                    salaryMinor: raw
                      ? String(parseAmount(raw, String(f.get("currency"))))
                      : null,
                    currency: f.get("currency"),
                    payDay: Number(f.get("payDay")),
                  };
                } else if (isCharge)
                  value = {
                    ...base,
                    operation: "charge",
                    employeeId: employee?.id,
                    period: String(f.get("period")) + "-01",
                    dueOn: f.get("dueOn"),
                    amountMinor: String(
                      parseAmount(String(f.get("amount")), currency),
                    ),
                    currency,
                  };
                else if (isPayment)
                  value = {
                    ...base,
                    operation: "payment",
                    chargeId: charge?.id,
                    amountMinor: String(
                      parseAmount(String(f.get("amount")), charge!.currency),
                    ),
                    currency: charge?.currency,
                    expectedBalanceMinor: charge?.balanceMinor,
                    paidOn: f.get("paidOn"),
                    method: f.get("method"),
                    reference: f.get("reference"),
                  };
                else if (isReverse)
                  value = {
                    ...base,
                    expenseId: payment?.expenseId,
                    cashOn: f.get("paidOn"),
                  };
                else
                  value = { ...base, operation: "void", chargeId: charge?.id };
                setPrepared(value);
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Enter a valid salary amount.",
                );
              }
            }}
          >
            {isEmployee ? (
              <>
                <label>
                  Full name
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={100}
                    defaultValue={action.employee?.name}
                  />
                </label>
                <label>
                  Job title
                  <input
                    name="title"
                    required
                    minLength={2}
                    maxLength={100}
                    defaultValue={action.employee?.title}
                  />
                </label>
                <label>
                  Branch
                  <select
                    name="branchId"
                    aria-label="Branch"
                    defaultValue={action.employee?.branchId ?? data.branchId}
                    required
                  >
                    <option value="">Choose branch</option>
                    {data.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Trainer profile
                  <select
                    aria-label="Trainer profile"
                    name="trainerId"
                    defaultValue={action.employee?.trainerId ?? ""}
                  >
                    <option value="">Employee only</option>
                    {action.employee?.trainerId &&
                    !data.trainerOptions.some(
                      (t) => t.id === action.employee?.trainerId,
                    ) ? (
                      <option value={action.employee.trainerId}>
                        Current linked trainer (unavailable)
                      </option>
                    ) : null}
                    {data.trainerOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Phone
                  <input
                    name="phone"
                    type="tel"
                    maxLength={50}
                    defaultValue={action.employee?.phone}
                  />
                </label>
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    maxLength={254}
                    defaultValue={action.employee?.email}
                  />
                </label>
                <label>
                  Employment start
                  <input
                    type="date"
                    name="startOn"
                    required
                    defaultValue={
                      action.employee?.startOn ?? data.organization.today
                    }
                  />
                </label>
                <label>
                  Monthly salary
                  <input
                    name="salary"
                    inputMode="decimal"
                    placeholder="Not configured"
                    defaultValue={
                      action.employee?.salaryMinor
                        ? amountInput(
                            Number(action.employee.salaryMinor),
                            action.employee.currency,
                          )
                        : ""
                    }
                  />
                </label>
                <label>
                  Currency
                  <input
                    name="currency"
                    required
                    pattern="[A-Z]{3}"
                    maxLength={3}
                    defaultValue={
                      action.employee?.currency ?? data.organization.currency
                    }
                  />
                </label>
                <label>
                  Monthly pay day
                  <input
                    name="payDay"
                    type="number"
                    min={1}
                    max={28}
                    required
                    defaultValue={action.employee?.payDay ?? 1}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={action.employee?.active ?? true}
                  />
                  Active employee
                </label>
                <p>
                  This profile creates no sign-in account. Leave salary blank
                  until a rate is agreed.
                </p>
              </>
            ) : null}
            {isCharge ? (
              <>
                <p>
                  {employee?.name} / {currency}
                </p>
                <label>
                  Salary month
                  <input
                    name="period"
                    type="month"
                    required
                    defaultValue={month}
                  />
                </label>
                <label>
                  Due date
                  <input
                    name="dueOn"
                    type="date"
                    required
                    defaultValue={
                      month +
                      "-" +
                      String(employee?.payDay ?? 1).padStart(2, "0")
                    }
                  />
                </label>
                <label>
                  Salary amount
                  <input
                    name="amount"
                    inputMode="decimal"
                    required
                    defaultValue={
                      employee?.salaryMinor
                        ? amountInput(
                            Number(employee.salaryMinor),
                            employee.currency,
                          )
                        : ""
                    }
                  />
                </label>
                <p>
                  Review the agreed rate and any adjustment before posting. This
                  does not send money.
                </p>
              </>
            ) : null}
            {isPayment ? (
              <>
                <p>
                  Remaining{" "}
                  {exactMoney(
                    charge!.balanceMinor,
                    charge!.currency,
                    data.organization.locale,
                  )}
                </p>
                <label>
                  Payment amount
                  <input
                    name="amount"
                    inputMode="decimal"
                    required
                    defaultValue={amountInput(
                      Number(charge!.balanceMinor),
                      charge!.currency,
                    )}
                  />
                </label>
                <label>
                  Payment date
                  <input
                    type="date"
                    name="paidOn"
                    max={data.organization.today}
                    required
                    defaultValue={data.organization.today}
                  />
                </label>
                <label>
                  Payment method
                  <select name="method" aria-label="Payment method">
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  Reference
                  <input name="reference" maxLength={120} />
                </label>
                <p>
                  This creates one cash expense in the Staff salaries category.
                </p>
              </>
            ) : null}
            {isReverse ? (
              <>
                <p>
                  Reverse the full{" "}
                  {exactMoney(
                    payment!.amountMinor,
                    payment!.currency,
                    data.organization.locale,
                  )}{" "}
                  recorded in {payment?.number}. The original payment stays in
                  history.
                </p>
                <label>
                  Reversal cash date
                  <input
                    name="paidOn"
                    type="date"
                    min={payment?.paidOn}
                    max={data.organization.today}
                    defaultValue={data.organization.today}
                    required
                  />
                </label>
              </>
            ) : null}
            {action.operation === "void" ? (
              <p>
                Void {charge?.period.slice(0, 7)} salary entry. A replacement
                can then be recorded; original history remains.
              </p>
            ) : null}
            <label>
              Reason
              <input name="reason" minLength={3} maxLength={300} required />
            </label>
            <button className="primary" type="submit">
              Review {isEmployee ? "employee" : "payroll"}
            </button>
          </form>
          {prepared ? (
            <section>
              <h3>Review {isEmployee ? "employee" : "payroll"}</h3>
              <dl className="review-list">
                <dt>Employee</dt>
                <dd>
                  {String(
                    prepared.name ?? employee?.name ?? charge?.employeeName,
                  )}
                </dd>
                {isEmployee ? (
                  <>
                    <dt>Role</dt>
                    <dd>{String(prepared.title)}</dd>
                    <dt>Monthly salary</dt>
                    <dd>
                      {prepared.salaryMinor
                        ? exactMoney(
                            String(prepared.salaryMinor),
                            String(prepared.currency),
                            data.organization.locale,
                          )
                        : "Not configured"}
                    </dd>
                    <dt>Branch</dt>
                    <dd>
                      {
                        data.branches.find((b) => b.id === prepared.branchId)
                          ?.name
                      }
                    </dd>
                  </>
                ) : (
                  <>
                    <dt>Month</dt>
                    <dd>
                      {String(prepared.period ?? charge?.period).slice(0, 7)}
                    </dd>
                    <dt>Amount</dt>
                    <dd>
                      {exactMoney(
                        String(
                          prepared.amountMinor ??
                            payment?.amountMinor ??
                            charge?.amountMinor,
                        ),
                        String(
                          prepared.currency ??
                            payment?.currency ??
                            charge?.currency,
                        ),
                        data.organization.locale,
                      )}
                    </dd>
                  </>
                )}
                {!isEmployee &&
                (prepared.dueOn || prepared.paidOn || prepared.cashOn) ? (
                  <>
                    <dt>Date</dt>
                    <dd>
                      {String(
                        prepared.dueOn ?? prepared.paidOn ?? prepared.cashOn,
                      )}
                    </dd>
                  </>
                ) : null}
                {prepared.method ? (
                  <>
                    <dt>Method</dt>
                    <dd>{String(prepared.method)}</dd>
                    <dt>Reference</dt>
                    <dd>{String(prepared.reference) || "None"}</dd>
                  </>
                ) : null}
                <dt>Reason</dt>
                <dd>{String(prepared.reason)}</dd>
              </dl>
              <button
                className="primary"
                disabled={pending || blocked}
                onClick={confirm}
              >
                {pending
                  ? "Saving..."
                  : attempted
                    ? "Retry save"
                    : "Confirm " + (isEmployee ? "employee" : "payroll")}
              </button>
              {!attempted ? (
                <button onClick={() => setPrepared(null)}>Back to edit</button>
              ) : null}
              {blocked ? (
                <p>
                  Reload current employee and salary details before another
                  change.
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </Drawer>
  );
}
