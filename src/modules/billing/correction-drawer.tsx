"use client";
import { useState } from "react";
import { Drawer } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/section-title";
import { parseAmount } from "@/modules/plans/format";
import { exactMoney } from "./format";
import type { InvoiceDetail } from "./types";
type Result = {
  correctionId: string;
  number: string;
  balanceAfterMinor: string;
};
export function CorrectionDrawer({
  detail,
  today,
  onClose,
  onSaved,
}: {
  detail: InvoiceDetail;
  today: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [kind, setKind] = useState("credit"),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [reference, setReference] = useState(""),
    [cashOn, setCashOn] = useState(today),
    [method, setMethod] = useState("cash"),
    [paymentId, setPaymentId] = useState(detail.payments.payments[0]?.id ?? ""),
    [choices, setChoices] = useState(detail.payments.payments),
    [q, setQ] = useState(""),
    [key] = useState(() => crypto.randomUUID()),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<Result | null>(null);
  const i = detail.invoice,
    org = detail.organization.id,
    refund = kind === "refund" || kind === "refund_credit";
  const labels: Record<string, string> = {
    credit: "Credit unpaid charge",
    refund: "Refund received payment",
    refund_credit: "Refund and credit charge",
    void: "Void unused invoice",
  };
  let minor = "0";
  try {
    minor = String(parseAmount(amount, i.currency));
  } catch {}
  async function find() {
    setBusy(true);
    setError("");
    try {
      const p = new URLSearchParams({
        organizationId: org,
        invoiceId: i.id,
        q,
      });
      const r = await fetch("/api/payments?" + p, { cache: "no-store" }),
        j = await r.json();
      if (!r.ok) throw Error(j.error?.message ?? "Could not find receipts");
      setChoices(j.data.payments);
      setPaymentId(j.data.payments[0]?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not find receipts");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      title={result ? "Correction recorded" : "Correct invoice"}
      busy={busy}
      onClose={onClose}
    >
      {result ? (
        <section className="payment-success">
          <SectionTitle
            title="Saved adjustment"
            help="The original invoice and payment history are preserved."
          />
          <h3>{result.number}</h3>
          <p>
            Remaining balance:{" "}
            {exactMoney(
              result.balanceAfterMinor,
              i.currency,
              detail.organization.locale,
            )}
          </p>
          <button className="button primary" onClick={onClose}>
            Done
          </button>
        </section>
      ) : (
        <form
          className="invoice-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              const amountMinor =
                kind === "void" ? "0" : String(parseAmount(amount, i.currency));
              if (kind !== "void" && BigInt(amountMinor) <= 0n)
                throw Error("Enter a positive correction amount.");
              if (refund && !paymentId)
                throw Error("Choose the original paid receipt.");
              if (!review) {
                setReview(true);
                return;
              }
              setBusy(true);
              const r = await fetch(`/api/invoices/${i.id}/corrections`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    organizationId: org,
                    invoiceId: i.id,
                    requestKey: key,
                    kind,
                    amountMinor,
                    expectedBalanceMinor: i.balanceMinor,
                    currency: i.currency,
                    cashOn,
                    reason,
                    reference,
                    ...(refund ? { paymentId, method } : {}),
                  }),
                }),
                j = await r.json();
              if (!r.ok)
                throw Error(j.error?.message ?? "Could not record correction");
              setResult(j.data);
              try {
                await onSaved();
              } catch {
                setError(
                  "Correction saved. Reload the invoice before making another change.",
                );
              }
            } catch (e) {
              setError(
                e instanceof TypeError
                  ? "Result could not be confirmed. Keep this review and retry safely."
                  : e instanceof Error
                    ? e.message
                    : "Could not record correction",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <SectionTitle
            title="Financial correction"
            help="Owner approval is required. Credits reduce unpaid charges. Refunds record funds actually returned and reopen debt unless paired with an explicit credit. Membership cancellation remains separate."
          />
          <p>
            {i.number} · {i.recipientName}
          </p>
          <p>
            Current balance:{" "}
            <strong>
              {exactMoney(
                i.balanceMinor,
                i.currency,
                detail.organization.locale,
              )}
            </strong>
          </p>
          <fieldset disabled={busy || review} className="drawer-fields">
            <label>
              Correction type
              <select
                aria-label="Correction type"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {Object.entries(labels).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {refund ? (
              <>
                <label>
                  Find original receipt
                  <input
                    value={q}
                    maxLength={100}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="button secondary"
                  onClick={find}
                >
                  Search original receipts
                </button>
                <label>
                  Original paid receipt
                  <select
                    aria-label="Original paid receipt"
                    value={paymentId}
                    onChange={(e) => setPaymentId(e.target.value)}
                    required
                  >
                    <option value="">Choose a receipt</option>
                    {choices.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.receiptNumber} ·{" "}
                        {exactMoney(
                          p.amountMinor,
                          p.currency,
                          detail.organization.locale,
                        )}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Refund method
                  <select
                    aria-label="Refund method"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </>
            ) : null}
            {kind !== "void" ? (
              <label>
                Correction amount ({i.currency})
                <input
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
            ) : (
              <p>
                Void is only available when this invoice has no payment or
                correction history. Its number stays reserved.
              </p>
            )}
            <label>
              Correction date
              <input
                required
                type="date"
                min={i.issuedOn ?? undefined}
                max={today}
                value={cashOn}
                onChange={(e) => setCashOn(e.target.value)}
              />
            </label>
            <label>
              Reference (optional)
              <input
                value={reference}
                maxLength={100}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <label>
              Reason
              <input
                required
                minLength={3}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </fieldset>
          {review ? (
            <section className="invoice-review" aria-label="Correction review">
              <h3>Review correction</h3>
              <p>{labels[kind]}</p>
              {kind !== "void" ? (
                <p>
                  {exactMoney(minor, i.currency, detail.organization.locale)}
                </p>
              ) : null}
              <p>
                {cashOn} · {reason}
              </p>
              {refund ? (
                <p>
                  Confirm only after the funds have actually been returned to
                  the member.
                </p>
              ) : null}
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setReview(false)}
              >
                Back to edit correction
              </button>
            </section>
          ) : null}
          {error ? (
            <p role="alert" className="settings-error">
              {error}
            </p>
          ) : null}
          <button className="button primary" disabled={busy}>
            {busy
              ? "Saving correction…"
              : review
                ? "Confirm correction"
                : "Review correction"}
          </button>
        </form>
      )}
      {result && error ? (
        <p role="alert" className="settings-error">
          {error}
        </p>
      ) : null}
    </Drawer>
  );
}
