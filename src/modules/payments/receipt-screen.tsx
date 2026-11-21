"use client";
import Link from "next/link";
import { useState } from "react";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { exactMoney } from "@/modules/billing/format";
import { SectionTitle } from "@/components/ui/section-title";
import { useHydrated } from "@/lib/use-hydrated";
import { methodLabel, type Receipt } from "./types";
export function ReceiptScreen({ initial }: { initial: Receipt }) {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { payment: p, snapshot: s } = initial,
    money = (n: string) => exactMoney(n, p.currency, s.issuer.locale);
  async function download() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/receipts/${p.id}/pdf?organizationId=${initial.organization.id}`,
        { cache: "no-store" },
      );
      if (!r.ok) {
        const j = await r.json();
        throw Error(j.error?.message ?? "Could not download receipt.");
      }
      if (!r.headers.get("content-type")?.includes("application/pdf"))
        throw Error("Receipt PDF was unavailable. Try again.");
      const objectUrl = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = objectUrl;
      a.download = p.receiptNumber + ".pdf";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not download receipt. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceFrame
      organization={initial.organization}
      active="payments"
      canManageSettings={initial.canManageSettings}
      canManageMembers={initial.canManageMembers}
    >
      <div className="receipt-screen-actions">
        <Link
          className="text-action"
          href={`/payments?organizationId=${initial.organization.id}&invoiceId=${p.invoiceId}`}
        >
          Back to invoice
        </Link>
        <div>
          <button
            className="button secondary"
            disabled={!hydrated}
            onClick={() => window.print()}
          >
            Print receipt
          </button>
          <button
            className="button primary"
            disabled={busy || !hydrated}
            onClick={download}
          >
            {busy ? "Preparing PDF…" : "Download receipt PDF"}
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="settings-error receipt-screen-actions">
          {error}
        </p>
      ) : null}
      <article className="panel receipt-card" aria-label="Payment receipt">
        <header className="receipt-brand">
          <div>
            <p className="eyebrow">{s.issuer.name}</p>
            {s.issuer.address ? <p>{s.issuer.address}</p> : null}
            {s.issuer.email || s.issuer.phone ? (
              <p>
                {[s.issuer.email, s.issuer.phone].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
          <div>
            <h1>Payment receipt</h1>
            <p className="receipt-number">{p.receiptNumber}</p>
          </div>
        </header>
        <section>
          <SectionTitle
            title="Received from"
            help="This receipt confirms a saved payment. It preserves the original invoice recipient and the gym details at the time of payment."
          />
          <h2>{s.recipientName}</h2>
          <p className="support">
            {s.recipientCode} · {s.branchName}
          </p>
        </section>
        <dl className="receipt-details">
          <dt>Invoice</dt>
          <dd>{s.invoiceNumber}</dd>
          <dt>For</dt>
          <dd>{s.description}</dd>
          <dt>Payment date</dt>
          <dd>{p.paidOn}</dd>
          <dt>Method</dt>
          <dd>{methodLabel[p.method]}</dd>
          {p.reference ? (
            <>
              <dt>Reference</dt>
              <dd>{p.reference}</dd>
            </>
          ) : null}
          <dt>Recorded</dt>
          <dd>
            {new Intl.DateTimeFormat(s.issuer.locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: s.issuer.timeZone,
            }).format(new Date(p.createdAt))}
          </dd>
        </dl>
        <div className="receipt-amount">
          <span>Amount received</span>
          <strong>{money(p.amountMinor)}</strong>
        </div>
        <dl className="receipt-totals">
          <dt>Invoice total</dt>
          <dd>{money(s.invoiceTotalMinor)}</dd>
          <dt>Balance after this payment</dt>
          <dd>{money(p.balanceAfterMinor)}</dd>
        </dl>
        {p.note ? (
          <section>
            <h2>Receipt note</h2>
            <p>{p.note}</p>
          </section>
        ) : null}
        <footer>
          <p>
            This receipt confirms the payment above. Its balance is the invoice
            balance immediately after this payment; later payments or
            adjustments may change it.
          </p>
          {s.issuer.footer ? <p>{s.issuer.footer}</p> : null}
        </footer>
      </article>
    </WorkspaceFrame>
  );
}
