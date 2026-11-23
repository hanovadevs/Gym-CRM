"use client";
import Link from "next/link";
import { invalidateMemberFeeViews } from "@/modules/member-fees/invalidate";
import { useState } from "react";
import { Drawer } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/section-title";
import { amountInput, parseAmount } from "@/modules/plans/format";
import { exactMoney } from "@/modules/billing/format";
import type { InvoiceDetail } from "@/modules/billing/types";
import {
  activationLabel,
  methodLabel,
  type PaymentTarget,
  type PaymentResult,
} from "./types";
export function PaymentDrawer({
  organizationId,
  locale,
  today,
  branchId,
  initial,
  onClose,
  onSaved,
}: {
  organizationId: string;
  locale: string;
  today: string;
  branchId?: string;
  initial?: InvoiceDetail;
  onClose: () => void;
  onSaved: (result: PaymentResult) => Promise<void>;
}) {
  const [invoice, setInvoice] = useState<PaymentTarget | undefined>(
      initial
        ? {
            ...initial.invoice,
            number: initial.invoice.number!,
            issuedOn: initial.invoice.issuedOn!,
          }
        : undefined,
    ),
    [query, setQuery] = useState(""),
    [choices, setChoices] = useState<PaymentTarget[]>([]),
    [selected, setSelected] = useState(""),
    [count, setCount] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<PaymentResult | null>(null);
  async function find() {
    setBusy(true);
    setError("");
    try {
      const p = new URLSearchParams({ organizationId, q: query });
      if (branchId) p.set("branchId", branchId);
      const r = await fetch("/api/payments/targets?" + p, {
          cache: "no-store",
        }),
        j = await r.json();
      if (!r.ok) throw Error(j.error?.message ?? "Could not find invoices.");
      setChoices(j.data.invoices);
      setCount(j.data.total);
      setSelected(j.data.invoices[0]?.id ?? "");
    } catch (e) {
      setChoices([]);
      setCount(0);
      setSelected("");
      setError(e instanceof Error ? e.message : "Could not find invoices.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      title={result ? "Payment recorded" : "Record payment"}
      busy={busy}
      onClose={onClose}
    >
      {result ? (
        <section className="payment-success" aria-label="Payment confirmation">
          <SectionTitle
            title="Payment recorded"
            help="This payment is saved. Its paid receipt is ready to view, print or download."
          />
          <h3>{result.receiptNumber}</h3>
          <p>{activationLabel[result.activationResult]}</p>
          <p>
            Balance after payment:{" "}
            <strong>
              {exactMoney(result.balanceAfterMinor, invoice!.currency, locale)}
            </strong>
          </p>
          <Link
            className="button primary"
            href={`/receipts/${result.paymentId}?organizationId=${organizationId}`}
          >
            View paid receipt
          </Link>
          <button className="button secondary" onClick={onClose}>
            Done
          </button>
        </section>
      ) : invoice ? (
        <PaymentForm
          key={invoice.id}
          invoice={invoice}
          locale={locale}
          today={today}
          busy={busy}
          error={error}
          onSubmit={async (fields) => {
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/api/payments", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    organizationId,
                    invoiceId: invoice.id,
                    ...fields,
                  }),
                }),
                j = await r.json();
              if (!r.ok)
                throw Error(
                  j.error?.message ?? "Could not record this payment.",
                );
              const saved = {
                ...j.data,
                requestId: j.requestId,
              } as PaymentResult;
              setResult(saved);
              try {
                await onSaved(saved);
                await invalidateMemberFeeViews(organizationId);
              } catch {
                setError(
                  "Payment saved. The list could not refresh; use the paid receipt and reload the list before another payment.",
                );
              }
            } catch (e) {
              setError(
                e instanceof TypeError
                  ? "Could not confirm the payment result. Your review is kept. Retry this same payment safely."
                  : e instanceof Error
                    ? e.message
                    : "Could not record this payment. Your review is kept.",
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : (
        <section className="invoice-form">
          <SectionTitle
            title="Choose an invoice"
            help="Find an issued invoice with an outstanding balance in your permitted branches. Archived members may settle debt; payment never restores their access."
          />
          <label>
            Find invoice or member
            <input
              maxLength={100}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={busy}
            />
          </label>
          <button className="button secondary" disabled={busy} onClick={find}>
            Search outstanding invoices
          </button>
          {error ? (
            <p role="alert" className="settings-error">
              {error}
            </p>
          ) : null}
          <label>
            Invoice
            <select
              aria-label="Payment invoice"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={busy}
            >
              <option value="">Choose an invoice</option>
              {choices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.recipientName} · {i.number} · {i.currency}{" "}
                  {amountInput(Number(i.balanceMinor), i.currency)}
                </option>
              ))}
            </select>
          </label>
          {count !== null ? (
            <p className="support">
              {choices.length} of {count} outstanding invoices.{" "}
              {count > 25
                ? "Narrow the search to find another invoice."
                : count === 0
                  ? "No matching outstanding invoices."
                  : ""}
            </p>
          ) : null}
          <button
            className="button primary"
            disabled={busy || !selected}
            onClick={() => setInvoice(choices.find((i) => i.id === selected))}
          >
            Continue to payment
          </button>
        </section>
      )}
      {result && error ? (
        <p role="alert" className="settings-error">
          {error}
        </p>
      ) : null}
    </Drawer>
  );
}
function PaymentForm({
  invoice,
  locale,
  today,
  busy,
  error,
  onSubmit,
}: {
  invoice: PaymentTarget;
  locale: string;
  today: string;
  busy: boolean;
  error: string;
  onSubmit: (fields: Record<string, unknown>) => Promise<void>;
}) {
  const [amount, setAmount] = useState(
      amountInput(Number(invoice.balanceMinor), invoice.currency),
    ),
    [method, setMethod] = useState<"cash" | "bank_transfer" | "other">("cash"),
    [paidOn, setPaidOn] = useState(today),
    [reference, setReference] = useState(""),
    [note, setNote] = useState(""),
    [review, setReview] = useState(false),
    [localError, setError] = useState(""),
    [key] = useState(() => crypto.randomUUID());
  let minor: string | undefined;
  try {
    minor = String(parseAmount(amount, invoice.currency));
  } catch {}
  const remaining =
    minor && BigInt(minor) <= BigInt(invoice.balanceMinor)
      ? BigInt(invoice.balanceMinor) - BigInt(minor)
      : null;
  return (
    <form
      className="invoice-form payment-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          const amountMinor = String(parseAmount(amount, invoice.currency));
          if (
            BigInt(amountMinor) <= 0n ||
            BigInt(amountMinor) > BigInt(invoice.balanceMinor)
          )
            throw Error(
              "Enter a positive amount up to the remaining invoice balance.",
            );
          if (method === "bank_transfer" && reference.trim().length < 3)
            throw Error("Add the bank transfer reference.");
          if (!review) {
            setReview(true);
            return;
          }
          await onSubmit({
            amountMinor,
            expectedBalanceMinor: invoice.balanceMinor,
            currency: invoice.currency,
            method,
            paidOn,
            reference,
            note,
            requestKey: key,
          });
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Review the payment details.",
          );
        }
      }}
    >
      <SectionTitle
        title="Payment details"
        help="Record funds you received for this invoice. Review the amount, method and date before saving. A paid receipt is created when the payment is saved."
      />
      <div className="payment-invoice">
        <strong>{invoice.recipientName}</strong>
        <p>
          {invoice.number} · {invoice.description}
        </p>
        <p>
          {invoice.recipientCode} · {invoice.branchName}
        </p>
      </div>
      <p className="invoice-form-total">
        Outstanding{" "}
        <strong>
          {exactMoney(invoice.balanceMinor, invoice.currency, locale)}
        </strong>
      </p>
      <fieldset disabled={busy || review}>
        <label>
          Amount received ({invoice.currency})
          <input
            aria-label="Amount received"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <label>
          Payment method
          <select
            aria-label="Payment method"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Payment date
          <input
            type="date"
            min={invoice.issuedOn}
            max={today}
            required
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </label>
        <label>
          Payment reference{method === "bank_transfer" ? " (required)" : ""}
          <input
            aria-label="Payment reference"
            required={method === "bank_transfer"}
            minLength={method === "bank_transfer" ? 3 : undefined}
            maxLength={100}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <label>
          Receipt note (optional)
          <textarea
            aria-label="Receipt note"
            rows={3}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value.replace(/[\r\n]/g, " "))}
          />
        </label>
      </fieldset>
      {review ? (
        <section className="invoice-review" aria-label="Payment review">
          <h3>Review payment</h3>
          <p>
            Received:{" "}
            <strong>{exactMoney(minor!, invoice.currency, locale)}</strong>
          </p>
          <p>
            {methodLabel[method]} · {paidOn}
          </p>
          {reference ? <p>Reference: {reference}</p> : null}
          <p>
            Balance afterward:{" "}
            <strong>
              {exactMoney(remaining!.toString(), invoice.currency, locale)}
            </strong>
          </p>
          <p>
            A paid receipt is created after this payment is saved. Full
            settlement activates an eligible pending membership; dates and other
            access rules still apply.
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => setReview(false)}
          >
            Back to edit payment
          </button>
        </section>
      ) : (
        <p className="support">Receipt notes are printed for the member.</p>
      )}
      {error || localError ? (
        <p role="alert" className="settings-error">
          {localError || error}
        </p>
      ) : null}
      <button className="button primary" disabled={busy}>
        {busy
          ? "Saving payment…"
          : review
            ? "Confirm payment"
            : "Review payment"}
      </button>
    </form>
  );
}
