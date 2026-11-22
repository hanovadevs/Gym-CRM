"use client";
import Link from "next/link";
import { useState } from "react";
import { invalidatePlatformDirectory } from "./invalidate";
import { BrandMark } from "@/components/brand";
import { SignOut } from "@/components/sign-out";
import { Drawer, Table, Pill } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/section-title";
import { exactMoney } from "@/modules/billing/format";
import { amountInput, parseAmount } from "@/modules/plans/format";
import type { PlatformBillingData, FeeCharge, FeePayment } from "./billing";
import { feeStatus } from "./billing-labels";
type Action = {
  operation: "charge" | "payment" | "reverse" | "void";
  charge?: FeeCharge;
  payment?: FeePayment;
};
export function PlatformBillingScreen({
  initial,
}: {
  initial: PlatformBillingData;
}) {
  const [data, setData] = useState(initial),
    [action, setAction] = useState<Action | null>(null),
    [blocked, setBlocked] = useState(false);
  const path = "/admin/gyms/" + data.organization.id + "/billing";
  function href(
    page = data.page,
    chargeId = data.selected?.id,
    paymentPage = 1,
  ) {
    return (
      path +
      "?" +
      new URLSearchParams({
        page: String(page),
        ...(chargeId ? { chargeId } : {}),
        paymentPage: String(paymentPage),
      })
    );
  }
  const selected = data.selected;
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
      <main className="platform-main gym-analytics platform-fees">
        <Link className="text-action" href="/admin">
          Back to gym directory
        </Link>
        <section className="page-heading">
          <div>
            <p className="eyebrow">Gym account billing</p>
            <h1>{data.organization.name}</h1>
            <p>Monthly fees this gym pays to you.</p>
          </div>
          <button
            className="primary"
            disabled={blocked}
            onClick={() => setAction({ operation: "charge" })}
          >
            Add monthly charge
          </button>
        </section>
        <div className="platform-heading-actions">
          <Link href={"/admin/gyms/" + data.organization.id}>
            Gym analytics
          </Link>
          <Pill tone={data.summary.status === "paid" ? "success" : "warning"}>
            {feeStatus[data.summary.status]}
          </Pill>
          <span>{data.month.slice(0, 7)}</span>
        </div>
        <p className="analytics-caption">
          These charges are separate from the gym’s member invoices. Record
          payments when funds are received. Gym access is managed separately
          through suspension controls.
        </p>
        {blocked ? (
          <p role="alert" className="form-error">
            Saved records must be refreshed before another change.{" "}
            <button onClick={() => location.reload()}>Reload billing</button>
          </p>
        ) : null}
        <section className="panel analytics-finance">
          <SectionTitle
            title="Account balances"
            help="Agreed monthly charges less retained payments and payment reversals, across all months. Voided charges are excluded. Amounts remain separate by currency; no automatic bank confirmation or fee is assumed."
          />
          {data.totals.length ? (
            <div className="fee-totals">
              {data.totals.map((t) => (
                <dl key={t.currency}>
                  <dt>{t.currency} charged</dt>
                  <dd>
                    {exactMoney(
                      t.chargedMinor,
                      t.currency,
                      data.organization.locale,
                    )}
                  </dd>
                  <dt>Net payments recorded</dt>
                  <dd>
                    {exactMoney(
                      t.receivedMinor,
                      t.currency,
                      data.organization.locale,
                    )}
                  </dd>
                  <dt>Outstanding</dt>
                  <dd>
                    {exactMoney(
                      t.balanceMinor,
                      t.currency,
                      data.organization.locale,
                    )}
                  </dd>
                </dl>
              ))}
            </div>
          ) : (
            <p className="analytics-empty">
              No monthly fee has been recorded. Add the agreed charge for a
              billing month to start tracking payment.
            </p>
          )}
        </section>
        <section className="panel analytics-finance">
          <SectionTitle
            title="Monthly charges"
            help="Each gym has at most one active charge per calendar month. Paid, partial, unpaid and overdue statuses are calculated from the ledger. Add each agreed month explicitly; the most recent fee can prefill the next form. Incorrect unpaid charges can be voided and replaced without deleting history."
          />
          <Table caption="Monthly gym fee ledger">
            <thead>
              <tr>
                <th>Month</th>
                <th>Due</th>
                <th>Charge</th>
                <th>Paid</th>
                <th>Remaining</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.charges.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.billingMonth.slice(0, 7)}
                    {c.voidReason ? <small>{c.voidReason}</small> : null}
                  </td>
                  <td>{c.dueOn}</td>
                  <td>
                    {exactMoney(
                      c.amountMinor,
                      c.currency,
                      data.organization.locale,
                    )}
                  </td>
                  <td>
                    {exactMoney(
                      c.paidMinor,
                      c.currency,
                      data.organization.locale,
                    )}
                  </td>
                  <td>
                    {exactMoney(
                      c.balanceMinor,
                      c.currency,
                      data.organization.locale,
                    )}
                  </td>
                  <td>
                    <Pill tone={c.status === "paid" ? "success" : "warning"}>
                      {feeStatus[c.status]}
                    </Pill>
                  </td>
                  <td>
                    <Link href={href(data.page, c.id)}>View payments</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!data.charges.length ? (
            <p className="analytics-empty">No monthly charges yet.</p>
          ) : null}
          <nav aria-label="Monthly charge pages" className="member-pagination">
            <span>
              {data.total} charges · Page {data.page}
            </span>
            {data.page > 1 ? (
              <Link href={href(data.page - 1, "")}>Previous</Link>
            ) : null}
            {data.page * 25 < data.total ? (
              <Link href={href(data.page + 1, "")}>Next</Link>
            ) : null}
          </nav>
        </section>
        {selected ? (
          <section className="panel analytics-finance">
            <div className="platform-section-heading">
              <SectionTitle
                title={"Payments for " + selected.billingMonth.slice(0, 7)}
                help="Payment entries are retained with their actual received date and reference. A full reversal corrects an entry and reopens the balance; it never deletes the original payment. Staff/gym activation is unchanged."
              />
              <div className="platform-heading-actions">
                <button
                  className="primary"
                  disabled={
                    blocked ||
                    selected.status === "void" ||
                    selected.balanceMinor === "0"
                  }
                  onClick={() =>
                    setAction({ operation: "payment", charge: selected })
                  }
                >
                  Record gym payment
                </button>
                {selected.status !== "void" && selected.paidMinor === "0" ? (
                  <button
                    disabled={blocked}
                    onClick={() =>
                      setAction({ operation: "void", charge: selected })
                    }
                  >
                    Void charge
                  </button>
                ) : null}
              </div>
            </div>
            <p className="analytics-caption">
              Remaining:{" "}
              {exactMoney(
                selected.balanceMinor,
                selected.currency,
                data.organization.locale,
              )}{" "}
              · {feeStatus[selected.status]}
            </p>
            <Table caption="Recorded gym payments">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Reference / note</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.paidOn}</td>
                    <td>
                      {exactMoney(
                        p.amountMinor,
                        p.currency,
                        data.organization.locale,
                      )}
                    </td>
                    <td>{p.method.replaceAll("_", " ")}</td>
                    <td>
                      {p.reference || "No reference"}
                      {p.note ? <small>{p.note}</small> : null}
                    </td>
                    <td>
                      {p.reversedAt ? "Reversed" : "Recorded"}
                      {p.reversalReason ? (
                        <small>{p.reversalReason}</small>
                      ) : null}
                    </td>
                    <td>
                      {!p.reversedAt ? (
                        <button
                          className="text-action"
                          disabled={blocked}
                          onClick={() =>
                            setAction({
                              operation: "reverse",
                              payment: p,
                              charge: selected,
                            })
                          }
                        >
                          Reverse payment
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {!data.payments.length ? (
              <p className="analytics-empty">
                No payments recorded against this monthly charge.
              </p>
            ) : null}
            <nav aria-label="Gym payment pages" className="member-pagination">
              <span>
                {data.paymentTotal} payments · Page {data.paymentPage}
              </span>
              {data.paymentPage > 1 ? (
                <Link href={href(data.page, selected.id, data.paymentPage - 1)}>
                  Previous payments
                </Link>
              ) : null}
              {data.paymentPage * 25 < data.paymentTotal ? (
                <Link href={href(data.page, selected.id, data.paymentPage + 1)}>
                  Next payments
                </Link>
              ) : null}
            </nav>
          </section>
        ) : null}
        <p className="analytics-caption">
          Calendar dates use {data.organization.timeZone}. Current date:{" "}
          {data.today}. Rates and bank references are entered by your platform
          administrator.
        </p>
        {action ? (
          <FeeEditor
            action={action}
            data={data}
            onClose={() => setAction(null)}
            onBlock={() => setBlocked(true)}
            refresh={async (result) => {
              const r = await fetch(
                "/api/platform/billing?" +
                  new URLSearchParams({
                    organizationId: data.organization.id,
                    chargeId: result.chargeId,
                  }),
                { cache: "no-store" },
              );
              const v = await r.json();
              if (!r.ok || !v.ok)
                throw Error(
                  "The change was saved, but billing could not refresh. Reload before making another change.",
                );
              setData(v.data);
            }}
          />
        ) : null}
      </main>
    </div>
  );
}
function dueForMonth(month: string, day: number) {
  if (!/^\d{4}-\d{2}$/.test(month)) return "";
  const [y, m] = month.split("-").map(Number);
  return (
    month +
    "-" +
    String(Math.min(day, new Date(Date.UTC(y, m, 0)).getUTCDate())).padStart(
      2,
      "0",
    )
  );
}
function FeeEditor({
  action,
  data,
  onClose,
  onBlock,
  refresh,
}: {
  action: Action;
  data: PlatformBillingData;
  onClose: () => void;
  onBlock: () => void;
  refresh: (result: { chargeId: string }) => Promise<void>;
}) {
  const [requestKey] = useState(() => crypto.randomUUID()),
    [prepared, setPrepared] = useState<Record<string, unknown> | null>(null),
    [attempted, setAttempted] = useState(false),
    [pending, setPending] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState(""),
    [reload, setReload] = useState(false),
    [month, setMonth] = useState(data.month.slice(0, 7)),
    [dueOn, setDueOn] = useState(
      dueForMonth(
        data.month.slice(0, 7),
        data.template?.dueDay ?? Number(data.today.slice(-2)),
      ),
    );
  const creating = action.operation === "charge",
    payment = action.operation === "payment",
    currency =
      action.charge?.currency ??
      data.template?.currency ??
      data.organization.currency;
  const title = creating
    ? "Add monthly charge"
    : payment
      ? "Record gym payment"
      : action.operation === "reverse"
        ? "Reverse gym payment"
        : "Void monthly charge";
  async function confirm() {
    if (!prepared || pending || reload) return;
    setPending(true);
    setError("");
    setAttempted(true);
    try {
      const r = await fetch("/api/platform/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prepared),
      });
      const v = await r.json();
      if (!r.ok || !v.ok) {
        if (r.status === 409 || r.status === 403) {
          setReload(true);
          onBlock();
        } else if (r.status === 422) {
          setPrepared(null);
          setAttempted(false);
        }
        throw Error(v.error?.message ?? "Unable to save billing.");
      }
      setSaved(true);
      try {
        await refresh(v.data);
      } catch (e) {
        setReload(true);
        onBlock();
        throw e;
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to reach the server. Retry the same saved request.",
      );
    } finally {
      setPending(false);
    }
  }
  async function close() {
    if (saved) {
      setPending(true);
      try {
        await invalidatePlatformDirectory();
      } catch {
        setError(
          "Billing was saved. Close again to refresh the directory, or reload this page.",
        );
        return;
      } finally {
        setPending(false);
      }
    }
    onClose();
  }
  return (
    <Drawer title={title} onClose={close} busy={pending}>
      <p className="drawer-intro">
        {creating
          ? "Enter the agreed monthly fee. Review the period, amount and due date before saving."
          : payment
            ? "Record funds received for this gym account. Partial payments are supported."
            : action.operation === "reverse"
              ? "The original payment will be retained and its full amount removed from net collections. The fee balance will reopen."
              : "Voiding retains this monthly charge in history. It is available only when no unreversed payments remain."}
      </p>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {saved ? (
        <section>
          <h3>Billing saved</h3>
          <p>The billing entry and its audit record were saved together.</p>
          {reload ? (
            <button onClick={() => location.reload()}>Reload billing</button>
          ) : (
            <button className="primary" onClick={close}>
              Done
            </button>
          )}
        </section>
      ) : (
        <>
          <form
            className="invoice-form"
            hidden={!!prepared}
            onSubmit={(e) => {
              e.preventDefault();
              if (pending || reload) return;
              const form = new FormData(e.currentTarget);
              try {
                const shared = {
                  organizationId: data.organization.id,
                  requestKey,
                  operation: action.operation,
                  reason: String(form.get("reason")),
                };
                let payload: Record<string, unknown>;
                if (creating) {
                  const cur = String(form.get("currency")).trim().toUpperCase(),
                    amount = String(
                      parseAmount(String(form.get("amount")), cur),
                    );
                  if (BigInt(amount) <= 0n)
                    throw Error("Enter a fee greater than zero.");
                  payload = {
                    ...shared,
                    billingMonth: month + "-01",
                    dueOn: String(form.get("dueOn")),
                    amountMinor: amount,
                    currency: cur,
                  };
                } else if (payment) {
                  const amount = String(
                    parseAmount(String(form.get("amount")), currency),
                  );
                  if (
                    BigInt(amount) <= 0n ||
                    BigInt(amount) > BigInt(action.charge!.balanceMinor)
                  )
                    throw Error(
                      "Enter an amount within the remaining fee balance.",
                    );
                  payload = {
                    ...shared,
                    chargeId: action.charge!.id,
                    amountMinor: amount,
                    currency,
                    expectedBalanceMinor: action.charge!.balanceMinor,
                    paidOn: String(form.get("paidOn")),
                    method: String(form.get("method")),
                    reference: String(form.get("reference")),
                    note: String(form.get("note")),
                  };
                } else if (action.operation === "reverse")
                  payload = {
                    ...shared,
                    paymentId: action.payment!.id,
                    cashOn: String(form.get("cashOn")),
                  };
                else payload = { ...shared, chargeId: action.charge!.id };
                setError("");
                setPrepared(payload);
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Check billing values.",
                );
              }
            }}
          >
            <fieldset disabled={pending || reload}>
              {creating ? (
                <>
                  <label>
                    Billing month
                    <input
                      type="month"
                      value={month}
                      max={
                        String(Number(data.today.slice(0, 4)) + 1) +
                        data.today.slice(4, 7)
                      }
                      onChange={(e) => {
                        setMonth(e.target.value);
                        setDueOn(
                          dueForMonth(
                            e.target.value,
                            data.template?.dueDay ??
                              Number(data.today.slice(-2)),
                          ),
                        );
                      }}
                      required
                    />
                  </label>
                  <label>
                    Currency
                    <input
                      name="currency"
                      defaultValue={currency}
                      pattern="[A-Za-z]{3}"
                      minLength={3}
                      maxLength={3}
                      required
                    />
                  </label>
                  <label>
                    Monthly fee
                    <input
                      name="amount"
                      inputMode="decimal"
                      defaultValue={
                        data.template
                          ? amountInput(
                              Number(data.template.amountMinor),
                              currency,
                            )
                          : ""
                      }
                      required
                    />
                  </label>
                  <label>
                    Due on
                    <input
                      type="date"
                      name="dueOn"
                      min={month + "-01"}
                      value={dueOn}
                      onChange={(e) => setDueOn(e.target.value)}
                      required
                    />
                  </label>
                </>
              ) : null}
              {payment ? (
                <>
                  <p>
                    Remaining:{" "}
                    {exactMoney(
                      action.charge!.balanceMinor,
                      currency,
                      data.organization.locale,
                    )}
                  </p>
                  <label>
                    Payment amount
                    <input
                      name="amount"
                      inputMode="decimal"
                      defaultValue={amountInput(
                        Number(action.charge!.balanceMinor),
                        currency,
                      )}
                      required
                    />
                  </label>
                  <label>
                    Received on
                    <input
                      type="date"
                      name="paidOn"
                      defaultValue={data.today}
                      max={data.today}
                      required
                    />
                  </label>
                  <label>
                    Method
                    <select
                      name="method"
                      aria-label="Method"
                      defaultValue="cash"
                    >
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label>
                    Reference
                    <input name="reference" maxLength={100} />
                  </label>
                  <label>
                    Payment note
                    <input name="note" maxLength={300} />
                  </label>
                </>
              ) : null}
              {action.operation === "reverse" ? (
                <>
                  <p>
                    Full reversal:{" "}
                    {exactMoney(
                      action.payment!.amountMinor,
                      currency,
                      data.organization.locale,
                    )}
                  </p>
                  <label>
                    Reversal date
                    <input
                      type="date"
                      name="cashOn"
                      defaultValue={data.today}
                      min={action.payment!.paidOn}
                      max={data.today}
                      required
                    />
                  </label>
                </>
              ) : null}
              <label>
                Reason
                <textarea
                  name="reason"
                  minLength={3}
                  maxLength={300}
                  rows={3}
                  required
                />
              </label>
            </fieldset>
            <button className="primary" type="submit">
              Review billing entry
            </button>
          </form>
          {prepared ? (
            <section className="fee-review">
              <h3>Review billing entry</h3>
              <dl>
                <dt>Gym</dt>
                <dd>{data.organization.name}</dd>
                <dt>Action</dt>
                <dd>{title}</dd>
                <dt>Month</dt>
                <dd>
                  {creating
                    ? String(prepared.billingMonth).slice(0, 7)
                    : action.charge?.billingMonth.slice(0, 7)}
                </dd>
                <dt>Amount</dt>
                <dd>
                  {exactMoney(
                    String(
                      prepared.amountMinor ??
                        action.payment?.amountMinor ??
                        action.charge?.amountMinor,
                    ),
                    String(prepared.currency ?? currency),
                    data.organization.locale,
                  )}
                </dd>
                {prepared.dueOn || prepared.paidOn || prepared.cashOn ? (
                  <>
                    <dt>Date</dt>
                    <dd>
                      {String(
                        prepared.dueOn ?? prepared.paidOn ?? prepared.cashOn,
                      )}
                    </dd>
                  </>
                ) : null}
                {prepared.reference ? (
                  <>
                    <dt>Reference</dt>
                    <dd>{String(prepared.reference)}</dd>
                  </>
                ) : null}
                <dt>Reason</dt>
                <dd>{String(prepared.reason)}</dd>
              </dl>
              {reload ? (
                <button onClick={() => location.reload()}>
                  Reload billing
                </button>
              ) : (
                <div className="platform-heading-actions">
                  <button
                    className="primary"
                    disabled={pending}
                    onClick={confirm}
                  >
                    {pending
                      ? "Saving…"
                      : attempted
                        ? "Retry saved request"
                        : "Confirm billing entry"}
                  </button>
                  {!attempted ? (
                    <button onClick={() => setPrepared(null)}>
                      Edit entry
                    </button>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}
        </>
      )}
    </Drawer>
  );
}
