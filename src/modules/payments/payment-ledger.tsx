"use client";
import Link from "next/link";
import { useState } from "react";
import { SectionTitle } from "@/components/ui/section-title";
import { exactMoney } from "@/modules/billing/format";
import { methodLabel, type PaymentPage } from "./types";
import type { PaymentQuery } from "./schemas";
export function PaymentLedger({
  initial,
  organizationId,
  locale,
  compact = false,
  branches,
}: {
  initial: PaymentPage;
  organizationId: string;
  locale: string;
  compact?: boolean;
  branches?: { id: string; name: string }[];
}) {
  const [data, setData] = useState(initial),
    [query, setQuery] = useState(initial.query),
    [q, setQ] = useState(initial.query.q),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load(next = query) {
    setBusy(true);
    setError("");
    setQuery(next);
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries({ ...next, organizationId }))
        if (v !== undefined && v !== "") params.set(k, String(v));
      const r = await fetch("/api/payments?" + params, { cache: "no-store" }),
        j = await r.json();
      if (!r.ok) throw Error(j.error?.message ?? "Could not load payments.");
      setData(j.data);
      setQuery(j.data.query);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load payments.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={compact ? "panel payment-ledger compact" : "payment-ledger"}
      aria-label={compact ? "Member payments" : "Payments and receipts"}
    >
      <SectionTitle
        title={compact ? "Member payments" : "Payments & receipts"}
        help="Every row is a recorded payment with a paid receipt. Filter by the date you received the funds, branch or method. Currencies are shown separately."
      />
      {!error && !busy ? (
        <div className="payment-ledger-summary">
          <div>
            <span>Collected in this view</span>
            {data.summary.length ? (
              data.summary.map((c) => (
                <strong key={c.currency}>
                  {exactMoney(c.amountMinor, c.currency, locale)}{" "}
                  <small>{c.currency}</small>
                </strong>
              ))
            ) : (
              <strong>No payments recorded</strong>
            )}
          </div>
          <div>
            <span>Paid receipts</span>
            <strong>{data.total}</strong>
          </div>
        </div>
      ) : null}
      <form
        className="payment-filters"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          load({ ...query, q, page: 1 });
        }}
      >
        {branches && branches.length > 1 ? (
          <label>
            Branch
            <select
              aria-label="Payment branch filter"
              value={query.branchId ?? ""}
              disabled={busy}
              onChange={(e) =>
                load({
                  ...query,
                  branchId: e.target.value || undefined,
                  page: 1,
                })
              }
            >
              <option value="">All permitted branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Search receipts
          <input
            aria-label={compact ? "Search member receipts" : "Search receipts"}
            value={q}
            disabled={busy}
            maxLength={100}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Receipt, invoice, member or reference"
          />
        </label>
        <label>
          Method
          <select
            aria-label={
              compact ? "Member payment method filter" : "Payment method filter"
            }
            value={query.method}
            disabled={busy}
            onChange={(e) =>
              load({
                ...query,
                method: e.target.value as PaymentQuery["method"],
                page: 1,
              })
            }
          >
            <option value="all">All methods</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Received from
          <input
            aria-label={
              compact
                ? "Member payments received from"
                : "Payments received from"
            }
            type="date"
            value={query.from ?? ""}
            disabled={busy}
            onChange={(e) =>
              load({ ...query, from: e.target.value || undefined, page: 1 })
            }
          />
        </label>
        <label>
          Through
          <input
            aria-label={
              compact ? "Member payments through" : "Payments through"
            }
            type="date"
            value={query.to ?? ""}
            disabled={busy}
            onChange={(e) =>
              load({ ...query, to: e.target.value || undefined, page: 1 })
            }
          />
        </label>
        <button className="button secondary" disabled={busy}>
          Search receipts
        </button>
      </form>
      {error ? (
        <>
          <p role="alert" className="settings-error">
            {error}
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => load()}
          >
            Retry payments
          </button>
        </>
      ) : busy ? (
        <p role="status" className="empty">
          Loading payments…
        </p>
      ) : (
        <div
          className={
            compact
              ? "payment-records"
              : "panel invoice-table-panel payment-records"
          }
        >
          <div className="table-scroll">
            <table className="payment-table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Member</th>
                  <th>Invoice</th>
                  <th>Received</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.receiptNumber}
                      <small>{p.branchName}</small>
                    </td>
                    <td>
                      {p.recipientName}
                      <small>{p.recipientCode}</small>
                    </td>
                    <td>{p.invoiceNumber}</td>
                    <td>{p.paidOn}</td>
                    <td>{exactMoney(p.amountMinor, p.currency, locale)}</td>
                    <td>
                      {methodLabel[p.method]}
                      {p.reference ? <small>{p.reference}</small> : null}
                    </td>
                    <td>
                      <Link
                        className="text-action"
                        aria-label={`View receipt ${p.receiptNumber}`}
                        href={`/receipts/${p.id}?organizationId=${organizationId}`}
                      >
                        View receipt
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.payments.length ? (
            <p className="empty">
              No payments match these filters. Record funds received against an
              issued invoice to create a paid receipt.
            </p>
          ) : null}
          <div className="member-pagination">
            <span>
              {data.total} payments · Page {data.page} of{" "}
              {Math.max(1, Math.ceil(data.total / 25))}
            </span>
            <div>
              <button
                disabled={busy || data.page === 1}
                onClick={() => load({ ...query, page: data.page - 1 })}
              >
                Previous payments
              </button>
              <button
                disabled={busy || data.page * 25 >= data.total}
                onClick={() => load({ ...query, page: data.page + 1 })}
              >
                Next payments
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
