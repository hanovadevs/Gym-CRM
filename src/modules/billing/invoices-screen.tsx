"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { SectionTitle } from "@/components/ui/section-title";
import { Drawer } from "@/components/ui/primitives";
import { useHydrated } from "@/lib/use-hydrated";
import { amountInput, parseAmount, previousDay } from "@/modules/plans/format";
import { invoiceTotals } from "./calculations";
import { exactMoney, invoiceStatus } from "./format";
import type { DraftValues, InvoiceQuery } from "./schemas";
import type { InvoiceList, InvoiceDetail, Recipient } from "./types";
import { PaymentDrawer } from "@/modules/payments/payment-drawer";
import { PaymentLedger } from "@/modules/payments/payment-ledger";
import { CorrectionDrawer } from "./correction-drawer";
async function json(url: string, options?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...options }),
    j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? "Could not load invoices.");
  return j.data;
}
function queryString(q: InvoiceQuery) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q))
    if (v !== undefined && v !== "") p.set(k, String(v));
  return p.toString();
}
type Editor = {
  kind: "create" | "edit" | "issue";
  key: string;
  detail?: InvoiceDetail;
};
export function InvoicesScreen({
  initial,
  initialDetail = null,
}: {
  initial: InvoiceList;
  initialDetail?: InvoiceDetail | null;
}) {
  const [data, setData] = useState(initial),
    [q, setQ] = useState(initial.query.q),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false),
    [blocked, setBlocked] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [editor, setEditor] = useState<Editor | null>(null),
    [detail, setDetail] = useState<{
      id: string;
      data?: InvoiceDetail;
      error?: string;
    } | null>(
      initialDetail
        ? { id: initialDetail.invoice.id, data: initialDetail }
        : null,
    ),
    [pdfBusy, setPdfBusy] = useState(false),
    [payment, setPayment] = useState<{ initial?: InvoiceDetail } | null>(null),
    [correction, setCorrection] = useState<InvoiceDetail | null>(null),
    [view, setView] = useState<"invoices" | "receipts">("invoices");
  const seq = useRef(0),
    detailSeq = useRef(0),
    lastQuery = useRef(initial.query),
    hydrated = useHydrated(),
    locked = busy || blocked || failed || !hydrated;
  function url(query: InvoiceQuery, id?: string) {
    history.replaceState(
      null,
      "",
      "/payments?" + queryString(query) + (id ? "&invoiceId=" + id : ""),
    );
  }
  async function load(query = lastQuery.current, propagate = false) {
    lastQuery.current = query;
    const ticket = ++seq.current;
    setBusy(true);
    setError("");
    try {
      const next: InvoiceList = await json(
        "/api/invoices?" + queryString(query),
      );
      if (ticket !== seq.current) return;
      setData(next);
      setFailed(false);
      setBlocked(false);
      url(next.query);
    } catch (e) {
      if (ticket !== seq.current) return;
      setFailed(true);
      setError(e instanceof Error ? e.message : "Could not load invoices.");
      if (propagate) throw e;
    } finally {
      if (ticket === seq.current) setBusy(false);
    }
  }
  function closeDetail() {
    detailSeq.current++;
    setDetail(null);
    url(data.query);
  }
  async function openDetail(id: string) {
    const ticket = ++detailSeq.current;
    setDetail({ id });
    url(data.query, id);
    try {
      const result: InvoiceDetail = await json(
        `/api/invoices/${id}?organizationId=${data.organization.id}`,
      );
      if (ticket === detailSeq.current) setDetail({ id, data: result });
    } catch (e) {
      if (ticket === detailSeq.current)
        setDetail({
          id,
          error:
            e instanceof Error ? e.message : "Could not load this invoice.",
        });
    }
  }
  async function perform(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    let committed = false;
    try {
      const id = editor?.detail?.invoice.id,
        body = {
          organizationId: data.organization.id,
          requestKey: editor!.key,
          ...payload,
        };
      const result = await json(id ? `/api/invoices/${id}` : "/api/invoices", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      committed = true;
      setEditor(null);
      setDetail(null);
      detailSeq.current++;
      await load(lastQuery.current, true);
      const next: InvoiceDetail = await json(
        `/api/invoices/${result.invoiceId}?organizationId=${data.organization.id}`,
      );
      setDetail({ id: result.invoiceId, data: next });
      url(lastQuery.current, result.invoiceId);
      setMessage(
        payload.operation === "issue"
          ? "Invoice issued. Its charges and billing details are now preserved."
          : "Draft changes saved. Review the latest invoice status below.",
      );
    } catch (e) {
      if (committed) {
        setEditor(null);
        setDetail(null);
        setBlocked(true);
        setFailed(true);
        setError(
          "Changes were saved, but invoices could not be refreshed. Reload invoices before making more changes.",
        );
      } else
        throw new Error(
          e instanceof Error
            ? e.message
            : "Could not save this invoice. Your inputs are kept; retry the same request safely.",
        );
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!detail?.data) return;
    setPdfBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/invoices/${detail.id}/pdf?organizationId=${data.organization.id}`,
        { cache: "no-store" },
      );
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error?.message ?? "Could not download this invoice.");
      }
      if (!r.headers.get("content-type")?.includes("application/pdf"))
        throw new Error(
          "The invoice PDF was unavailable. Try downloading again.",
        );
      const blob = await r.blob(),
        link = document.createElement("a"),
        objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = detail.data.invoice.number + ".pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not download this invoice. Try again.",
      );
    } finally {
      setPdfBusy(false);
    }
  }
  const money = (n: string | number, c: string) =>
    exactMoney(n, c, data.organization.locale);
  return (
    <WorkspaceFrame
      organization={data.organization}
      active="payments"
      canManageSettings={data.canManageSettings}
      canManageMembers={data.canManageMembers}
    >
      <div className="page-heading">
        <div>
          <h1>Invoices &amp; balances</h1>
          <p>Review issued charges, outstanding balances and draft invoices.</p>
        </div>
        <div className="page-actions">
          <button
            className="button primary"
            disabled={locked}
            onClick={() => setPayment({})}
          >
            Record payment
          </button>
          <button
            className="button secondary"
            disabled={locked}
            onClick={() => {
              setError("");
              setEditor({ kind: "create", key: crypto.randomUUID() });
            }}
          >
            Create invoice
          </button>
        </div>
      </div>
      {message ? (
        <p role="status" className="settings-success">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="settings-error">
          {error}
        </p>
      ) : null}
      {failed || blocked ? (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => load()}
        >
          Reload invoices
        </button>
      ) : null}
      <div
        className="billing-view-tabs"
        role="tablist"
        aria-label="Billing views"
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            return;
          e.preventDefault();
          const next =
            e.key === "Home"
              ? "invoices"
              : e.key === "End"
                ? "receipts"
                : view === "invoices"
                  ? "receipts"
                  : "invoices";
          setView(next);
          e.currentTarget
            .querySelectorAll<HTMLButtonElement>('[role="tab"]')
            [next === "invoices" ? 0 : 1]?.focus();
        }}
      >
        <button
          role="tab"
          aria-selected={view === "invoices"}
          tabIndex={view === "invoices" ? 0 : -1}
          onClick={() => setView("invoices")}
        >
          Invoices &amp; balances
        </button>
        <button
          role="tab"
          aria-selected={view === "receipts"}
          tabIndex={view === "receipts" ? 0 : -1}
          onClick={() => setView("receipts")}
        >
          Payments &amp; receipts
        </button>
      </div>
      {view === "invoices" ? (
        <>
          {!failed && !busy ? (
            <div className="invoice-summary">
              <section className="panel">
                <SectionTitle
                  title="Outstanding"
                  help="Issued invoice balances within your selected branch, search, member and issue-date filters. Currencies are kept separate. Drafts are not debts."
                />
                {data.summary.currencies.length ? (
                  data.summary.currencies.map((c) => (
                    <p className="invoice-metric" key={c.currency}>
                      {money(c.outstandingMinor, c.currency)}{" "}
                      <small>{c.currency}</small>
                    </p>
                  ))
                ) : (
                  <p className="invoice-metric">No issued balances</p>
                )}
                <p>{data.summary.outstandingCount} invoices with a balance</p>
              </section>
              <section className="panel">
                <SectionTitle
                  title="Overdue invoices"
                  help="An issued invoice is overdue when its positive balance remains after the due date in the gym's time zone. Due today is outstanding, not overdue."
                />
                <p className="invoice-metric">{data.summary.overdueCount}</p>
                {data.summary.currencies
                  .filter((c) => BigInt(c.overdueMinor) > 0n)
                  .map((c) => (
                    <p key={c.currency}>{money(c.overdueMinor, c.currency)}</p>
                  ))}
              </section>
              <section className="panel">
                <SectionTitle
                  title="Draft invoices"
                  help="Drafts have no invoice number and do not create debt. Editing retains earlier line revisions. Review and issue a draft to commit the charge."
                />
                <p className="invoice-metric">{data.summary.draftCount}</p>
                <p>Review before issuing</p>
              </section>
            </div>
          ) : null}
          <div
            role="tablist"
            aria-label="Invoice records"
            className="invoice-tabs"
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                return;
              const tabs = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]:not(:disabled)',
                ),
              );
              if (!tabs.length) return;
              e.preventDefault();
              const current = tabs.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? tabs.length - 1
                    : (current +
                        (e.key === "ArrowRight" ? 1 : -1) +
                        tabs.length) %
                      tabs.length;
              tabs[next].focus();
              tabs[next].click();
            }}
          >
            {(
              [
                ["all", "All invoices"],
                ["outstanding", "Outstanding"],
                ["overdue", "Overdue"],
                ["draft", "Drafts"],
                ["issued", "Issued"],
              ] as const
            ).map(([status, label]) => (
              <button
                key={status}
                role="tab"
                aria-selected={data.query.status === status}
                disabled={busy}
                onClick={() => load({ ...lastQuery.current, status, page: 1 })}
              >
                {label}
              </button>
            ))}
          </div>
          <form
            className="invoice-filters"
            onSubmit={(e) => {
              e.preventDefault();
              load({ ...lastQuery.current, q, page: 1 });
            }}
          >
            <label>
              Search invoices
              <input
                value={q}
                maxLength={100}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Invoice, member, code or description"
              />
            </label>
            <label>
              Branch
              <select
                aria-label="Invoice branch"
                value={data.query.branchId ?? ""}
                disabled={busy}
                onChange={(e) =>
                  load({
                    ...lastQuery.current,
                    branchId: e.target.value || undefined,
                    page: 1,
                  })
                }
              >
                <option value="">All permitted branches</option>
                {data.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Issued from
              <input
                type="date"
                value={data.query.from ?? ""}
                disabled={busy}
                onChange={(e) =>
                  load({
                    ...lastQuery.current,
                    from: e.target.value || undefined,
                    page: 1,
                  })
                }
              />
            </label>
            <label>
              Through
              <input
                type="date"
                value={data.query.to ?? ""}
                disabled={busy}
                onChange={(e) =>
                  load({
                    ...lastQuery.current,
                    to: e.target.value || undefined,
                    page: 1,
                  })
                }
              />
            </label>
            <label>
              Sort
              <select
                aria-label="Invoice sort"
                value={data.query.sort}
                disabled={busy}
                onChange={(e) =>
                  load({
                    ...lastQuery.current,
                    sort: e.target.value as InvoiceQuery["sort"],
                    page: 1,
                  })
                }
              >
                <option value="newest">Newest first</option>
                <option value="due">Due date</option>
                <option value="amount">Highest amount</option>
              </select>
            </label>
            <button className="button secondary" disabled={busy}>
              Search
            </button>
          </form>
          {data.query.memberId ? (
            <p className="support">
              Showing invoices for this member.{" "}
              <Link
                className="text-action"
                href={`/payments?organizationId=${data.organization.id}`}
              >
                Show all members
              </Link>
            </p>
          ) : null}
          {busy ? (
            <p role="status" className="empty">
              Loading invoices…
            </p>
          ) : failed ? null : (
            <section
              className="panel invoice-table-panel"
              aria-label="Invoice list"
            >
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Member</th>
                      <th>Description</th>
                      <th>Due date</th>
                      <th>Total</th>
                      <th>Outstanding</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((i) => (
                      <tr key={i.id}>
                        <td>
                          {i.number ?? "Draft"}
                          <small>{i.branchName}</small>
                        </td>
                        <td>
                          {i.recipientName}
                          <small>{i.recipientCode}</small>
                        </td>
                        <td>{i.description}</td>
                        <td>{i.dueOn}</td>
                        <td>{money(i.totalMinor, i.currency)}</td>
                        <td>
                          {i.status === "draft"
                            ? "Not issued"
                            : money(i.balanceMinor, i.currency)}
                        </td>
                        <td>
                          <span
                            className={
                              "pill " +
                              (i.status === "draft"
                                ? "neutral"
                                : BigInt(i.balanceMinor) > 0n
                                  ? "warning"
                                  : "green")
                            }
                          >
                            {invoiceStatus(i, data.today)}
                          </span>
                        </td>
                        <td>
                          <button
                            className="text-action"
                            aria-label={`View ${i.number ?? i.description}`}
                            onClick={() => {
                              setError("");
                              openDetail(i.id);
                            }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.invoices.length ? (
                <div className="empty">
                  <h2>
                    {data.query.q ||
                    data.query.status !== "all" ||
                    data.query.branchId ||
                    data.query.from ||
                    data.query.to
                      ? "No matching invoices"
                      : "No invoices yet"}
                  </h2>
                  <p>
                    Enroll a member to issue their plan charge, or create a
                    draft for other services.
                  </p>
                </div>
              ) : null}
              <div className="member-pagination">
                <span>
                  {data.total} invoices · Page {data.page} of{" "}
                  {Math.max(1, Math.ceil(data.total / 25))}
                </span>
                <div>
                  <button
                    disabled={locked || data.page === 1}
                    onClick={() =>
                      load({ ...lastQuery.current, page: data.page - 1 })
                    }
                  >
                    Previous invoices
                  </button>
                  <button
                    disabled={locked || data.page * 25 >= data.total}
                    onClick={() =>
                      load({ ...lastQuery.current, page: data.page + 1 })
                    }
                  >
                    Next invoices
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      ) : !failed && !busy ? (
        <PaymentLedger
          key={data.requestId}
          initial={data.payments}
          branches={data.branches}
          organizationId={data.organization.id}
          locale={data.organization.locale}
        />
      ) : null}
      <p className="support">
        Invoice dates, payments and membership access are separate. Every
        recorded payment has a paid receipt; other access rules still apply
        after settlement.
      </p>
      {detail && !editor && !payment && !correction ? (
        <Drawer
          title="Invoice details"
          busy={pdfBusy || busy}
          onClose={closeDetail}
        >
          {detail.error ? (
            <>
              <p role="alert" className="settings-error">
                {detail.error}
              </p>
              <button
                className="button secondary"
                onClick={() => openDetail(detail.id)}
              >
                Retry invoice
              </button>
            </>
          ) : detail.data ? (
            <>
              <InvoiceContents detail={detail.data} today={data.today} />
              {error ? (
                <p role="alert" className="settings-error">
                  {error}
                </p>
              ) : null}
              <div className="invoice-actions">
                {detail.data.canAdjust &&
                detail.data.invoice.status === "issued" ? (
                  <button
                    className="button secondary"
                    disabled={locked}
                    onClick={() => setCorrection(detail.data!)}
                  >
                    Correct invoice
                  </button>
                ) : null}
                {detail.data.invoice.status === "issued" &&
                BigInt(detail.data.invoice.balanceMinor) > 0n ? (
                  <button
                    className="button primary"
                    disabled={locked}
                    onClick={() => setPayment({ initial: detail.data })}
                  >
                    Record payment
                  </button>
                ) : null}
                {detail.data.invoice.status === "draft" ? (
                  <>
                    <button
                      className="button secondary"
                      disabled={locked}
                      onClick={() =>
                        setEditor({
                          kind: "edit",
                          key: crypto.randomUUID(),
                          detail: detail.data,
                        })
                      }
                    >
                      Edit draft
                    </button>
                    <button
                      className="button primary"
                      disabled={locked}
                      onClick={() =>
                        setEditor({
                          kind: "issue",
                          key: crypto.randomUUID(),
                          detail: detail.data,
                        })
                      }
                    >
                      Issue invoice
                    </button>
                  </>
                ) : (
                  <button
                    className="button primary"
                    disabled={pdfBusy || busy || !hydrated}
                    onClick={download}
                  >
                    {pdfBusy ? "Preparing PDF…" : "Download PDF"}
                  </button>
                )}
              </div>
              {detail.data.invoice.status === "draft" ? (
                <p className="support">
                  Issue this draft to assign its invoice number and download a
                  shareable PDF.
                </p>
              ) : null}
            </>
          ) : (
            <p role="status">Loading invoice…</p>
          )}
        </Drawer>
      ) : null}
      {editor ? (
        <Drawer
          title={
            editor.kind === "create"
              ? "Create invoice"
              : editor.kind === "edit"
                ? "Edit draft"
                : "Issue invoice"
          }
          busy={busy}
          onClose={() => setEditor(null)}
        >
          {editor.kind === "issue" ? (
            <IssueForm detail={editor.detail!} busy={busy} onSave={perform} />
          ) : (
            <DraftForm
              data={data}
              detail={editor.detail}
              busy={busy}
              onSave={perform}
            />
          )}
        </Drawer>
      ) : null}
      {correction ? (
        <CorrectionDrawer
          detail={correction}
          today={data.today}
          onClose={() => setCorrection(null)}
          onSaved={async () => {
            try {
              await load(lastQuery.current, true);
              const fresh: InvoiceDetail = await json(
                `/api/invoices/${correction.invoice.id}?organizationId=${data.organization.id}`,
              );
              setDetail({ id: fresh.invoice.id, data: fresh });
            } catch (e) {
              setBlocked(true);
              setFailed(true);
              setError(
                "Correction saved. Reload invoices before another change.",
              );
              throw e;
            }
          }}
        />
      ) : null}
      {payment ? (
        <PaymentDrawer
          organizationId={data.organization.id}
          locale={data.organization.locale}
          today={data.today}
          branchId={data.query.branchId}
          initial={payment.initial}
          onClose={() => setPayment(null)}
          onSaved={async (result) => {
            setMessage(`Payment recorded. Receipt ${result.receiptNumber}.`);
            try {
              await load(lastQuery.current, true);
              if (detail) {
                const fresh: InvoiceDetail = await json(
                  `/api/invoices/${detail.id}?organizationId=${data.organization.id}`,
                );
                setDetail({ id: detail.id, data: fresh });
              }
            } catch (e) {
              setBlocked(true);
              setFailed(true);
              setError(
                "Payment was saved. Reload invoices before recording another payment.",
              );
              throw e;
            }
          }}
        />
      ) : null}
    </WorkspaceFrame>
  );
}
function InvoiceContents({
  detail,
  today,
}: {
  detail: InvoiceDetail;
  today: string;
}) {
  const { invoice: i, issuer } = detail,
    money = (n: string | number) => exactMoney(n, i.currency, issuer.locale);
  return (
    <div className="invoice-detail">
      <div className="invoice-detail-heading">
        <div>
          <p className="eyebrow">{issuer.name}</p>
          <h2>{i.number ?? "Draft invoice"}</h2>
        </div>
        <span className="pill neutral">{invoiceStatus(i, today)}</span>
      </div>
      <SectionTitle
        title="Billing details"
        help="Recipient, gym and branch details are preserved when an invoice is issued. Historical charges remain attributed to their original branch."
      />
      <dl className="invoice-details">
        <dt>Member</dt>
        <dd>
          {i.recipientName}
          <small>{i.recipientCode}</small>
        </dd>
        <dt>Branch</dt>
        <dd>{i.branchName}</dd>
        <dt>Issued</dt>
        <dd>{i.issuedOn ?? "Not issued"}</dd>
        <dt>Due</dt>
        <dd>{i.dueOn}</dd>
        <dt>Currency</dt>
        <dd>{i.currency}</dd>
      </dl>
      {detail.canManageMembers ? (
        <Link
          className="text-action"
          href={`/members/${i.memberId}?organizationId=${detail.organization.id}`}
        >
          Open member profile
        </Link>
      ) : null}
      <SectionTitle
        title="Invoice lines"
        help="Amounts use exact currency minor units. A fixed line discount cannot exceed that line's pre-discount charge. Issued amounts are immutable."
      />
      <p>{i.description}</p>
      {detail.membershipTerm ? (
        <p className="support">
          Original membership period: {detail.membershipTerm.startOn} —{" "}
          {previousDay(detail.membershipTerm.endOn)}
        </p>
      ) : null}
      <ol className="invoice-line-list">
        {detail.items.map((line) => (
          <li key={line.position}>
            <strong>{line.description}</strong>
            <p>
              {line.quantity} × {money(line.unitMinor)}
              {line.discountMinor
                ? ` − ${money(line.discountMinor)} discount`
                : ""}
            </p>
            <b>{money(line.totalMinor)}</b>
          </li>
        ))}
      </ol>
      <dl className="invoice-totals">
        <dt>Subtotal</dt>
        <dd>{money(detail.subtotalMinor)}</dd>
        <dt>Discounts</dt>
        <dd>{money(detail.discountMinor)}</dd>
        <dt>Invoice total</dt>
        <dd>{money(i.totalMinor)}</dd>
        <dt>Outstanding</dt>
        <dd>{i.status === "draft" ? "Not issued" : money(i.balanceMinor)}</dd>
      </dl>
      <section className="panel" aria-label="Financial corrections">
        <SectionTitle
          title="Financial corrections"
          help="Original charges and receipts stay unchanged. A refund reopens debt unless it includes an explicit credit. Void numbers remain reserved."
        />
        {detail.corrections.rows.length ? (
          <>
            <p className="support">
              Latest {detail.corrections.rows.length} of{" "}
              {detail.corrections.total} corrections
            </p>
            {detail.corrections.rows.map((c) => (
              <article className="invoice-review" key={c.id}>
                <h3>
                  {c.number} · {c.kind.replaceAll("_", " ")}
                </h3>
                <p>
                  {c.cashOn} ·{" "}
                  {exactMoney(
                    c.amountMinor,
                    i.currency,
                    detail.organization.locale,
                  )}
                  {c.method ? " · " + c.method.replaceAll("_", " ") : ""}
                </p>
                <p>{c.reason}</p>
                {c.reference ? <p>Reference: {c.reference}</p> : null}
                <p>
                  Balance afterward:{" "}
                  {exactMoney(
                    c.balanceAfterMinor,
                    i.currency,
                    detail.organization.locale,
                  )}
                </p>
                {c.paymentId ? (
                  <Link
                    className="text-action"
                    href={`/receipts/${c.paymentId}?organizationId=${detail.organization.id}`}
                  >
                    Original paid receipt
                  </Link>
                ) : null}
              </article>
            ))}
          </>
        ) : (
          <p className="support">No financial corrections recorded.</p>
        )}
      </section>
      <PaymentLedger
        key={detail.requestId}
        initial={detail.payments}
        organizationId={detail.organization.id}
        locale={detail.organization.locale}
        compact
      />
      <p className="support">
        {i.status === "draft"
          ? `Draft revision ${i.lineRevision}. No invoice number or debt exists yet.`
          : "This invoice records a charge. It is not proof of payment."}
      </p>
    </div>
  );
}
function DraftForm({
  data,
  detail,
  busy,
  onSave,
}: {
  data: InvoiceList;
  detail?: InvoiceDetail;
  busy: boolean;
  onSave: (v: Record<string, unknown>) => Promise<void>;
}) {
  const currency = detail?.invoice.currency ?? data.organization.currency;
  const [description, setDescription] = useState(
      detail?.invoice.description ?? "",
    ),
    [due, setDue] = useState(detail?.invoice.dueOn ?? data.today),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [review, setReview] = useState(false),
    [search, setSearch] = useState(""),
    [choices, setChoices] = useState<Recipient[]>([]),
    [count, setCount] = useState(0),
    [member, setMember] = useState(""),
    [finding, setFinding] = useState(false),
    [searched, setSearched] = useState(false);
  const [lines, setLines] = useState(() =>
    (
      detail?.items ?? [
        { description: "", quantity: 1, unitMinor: 0, discountMinor: 0 },
      ]
    ).map((l) => ({
      id: crypto.randomUUID(),
      description: l.description,
      quantity: String(l.quantity),
      unit: amountInput(l.unitMinor, currency),
      discount: amountInput(l.discountMinor, currency),
    })),
  );
  function values(): DraftValues {
    return {
      description,
      dueOn: due,
      currency,
      lines: lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unitMinor: parseAmount(l.unit, currency),
        discountMinor: parseAmount(l.discount, currency),
      })),
    };
  }
  const recipient = detail
    ? {
        name: detail.invoice.recipientName,
        memberCode: detail.invoice.recipientCode,
      }
    : choices.find((c) => c.id === member);
  let calculation: ReturnType<typeof invoiceTotals> | undefined;
  try {
    calculation = invoiceTotals(values().lines);
  } catch {}
  async function find() {
    setFinding(true);
    setError("");
    try {
      const p = new URLSearchParams({
        organizationId: data.organization.id,
        q: search,
      });
      if (data.query.branchId) p.set("branchId", data.query.branchId);
      const r = await json("/api/invoices/recipients?" + p);
      setChoices(r.recipients);
      setCount(r.total);
      setMember(r.recipients[0]?.id ?? "");
      setSearched(true);
    } catch (e) {
      setChoices([]);
      setMember("");
      setSearched(true);
      setError(e instanceof Error ? e.message : "Could not find members.");
    } finally {
      setFinding(false);
    }
  }
  return (
    <form
      className="invoice-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          const v = values();
          invoiceTotals(v.lines);
          if (!recipient)
            throw new Error("Find and choose a registered member.");
          if (!review) {
            setReview(true);
            return;
          }
          await onSave({
            ...(detail
              ? { operation: "edit", version: detail.invoice.version }
              : { memberId: member }),
            values: v,
            reason,
          });
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : "Could not save this draft. Your inputs are kept.",
          );
        }
      }}
    >
      {error ? (
        <p role="alert" className="settings-error">
          {error}
        </p>
      ) : null}
      <fieldset disabled={busy || finding || review}>
        <SectionTitle
          title="Recipient & dates"
          help="Choose a registered member within your permitted branches. Drafts do not enroll members or create access. Issuance preserves the current billing details."
        />
        {detail ? (
          <p>
            {recipient?.name} · {recipient?.memberCode}
          </p>
        ) : (
          <>
            <label>
              Find member
              <input
                value={search}
                maxLength={100}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Member name or code"
              />
            </label>
            <button type="button" className="button secondary" onClick={find}>
              {finding ? "Finding members…" : "Search members"}
            </button>
            <label>
              Member
              <select
                aria-label="Member"
                required
                value={member}
                onChange={(e) => setMember(e.target.value)}
              >
                <option value="">Choose a member</option>
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.memberCode} · {c.branchName}
                  </option>
                ))}
              </select>
            </label>
            {searched ? (
              <p className="support">
                {choices.length} of {count} registered members.{" "}
                {count > 25
                  ? "Narrow your search to find another member."
                  : count === 0
                    ? "Register or restore a member before creating an invoice."
                    : ""}
              </p>
            ) : null}
          </>
        )}
        <label>
          Invoice description
          <input
            required
            maxLength={100}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Due date
          <input
            type="date"
            required
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </label>
        <p className="support">
          Currency: {currency}. No tax regime is assumed.
        </p>
        <SectionTitle
          title="Line items"
          help="Use whole quantities and a fixed discount per line. Totals are recalculated by the server. Draft edits retain earlier line revisions."
        />
        {lines.map((line, n) => (
          <div className="invoice-edit-line" key={line.id}>
            <label>
              Line {n + 1} description
              <input
                required
                maxLength={150}
                value={line.description}
                onChange={(e) =>
                  setLines(
                    lines.map((l, k) =>
                      k === n ? { ...l, description: e.target.value } : l,
                    ),
                  )
                }
              />
            </label>
            <div className="invoice-line-fields">
              <label>
                Quantity
                <input
                  aria-label={`Line ${n + 1} quantity`}
                  type="number"
                  min={1}
                  max={10000}
                  step={1}
                  required
                  value={line.quantity}
                  onChange={(e) =>
                    setLines(
                      lines.map((l, k) =>
                        k === n ? { ...l, quantity: e.target.value } : l,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Unit price
                <input
                  aria-label={`Line ${n + 1} unit price`}
                  inputMode="decimal"
                  required
                  value={line.unit}
                  onChange={(e) =>
                    setLines(
                      lines.map((l, k) =>
                        k === n ? { ...l, unit: e.target.value } : l,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Discount
                <input
                  aria-label={`Line ${n + 1} discount`}
                  inputMode="decimal"
                  required
                  value={line.discount}
                  onChange={(e) =>
                    setLines(
                      lines.map((l, k) =>
                        k === n ? { ...l, discount: e.target.value } : l,
                      ),
                    )
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className="text-action"
              aria-label={`Remove line ${n + 1}`}
              disabled={lines.length === 1}
              onClick={() => setLines(lines.filter((_, k) => k !== n))}
            >
              Remove line
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button secondary"
          disabled={lines.length >= 30}
          onClick={() =>
            setLines([
              ...lines,
              {
                id: crypto.randomUUID(),
                description: "",
                quantity: "1",
                unit: amountInput(0, currency),
                discount: amountInput(0, currency),
              },
            ])
          }
        >
          Add line
        </button>
        <label>
          Reason for invoice
          <input
            required
            minLength={3}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </fieldset>
      {calculation ? (
        <p className="invoice-form-total">
          Invoice total{" "}
          <strong>
            {exactMoney(
              calculation.totalMinor,
              currency,
              data.organization.locale,
            )}
          </strong>
        </p>
      ) : (
        <p className="support">
          Enter valid amounts and quantities to calculate the total.
        </p>
      )}
      {review ? (
        <section className="invoice-review" aria-label="Draft review">
          <h3>Review draft</h3>
          <p>
            {recipient?.name} · {recipient?.memberCode}
          </p>
          <p>
            {description} · Due {due}
          </p>
          <p>
            No invoice number, debt, payment or membership is created by saving
            this draft.
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => setReview(false)}
          >
            Back to edit
          </button>
        </section>
      ) : null}
      <button className="button primary" disabled={busy || finding}>
        {busy ? "Saving…" : review ? "Save draft" : "Review draft"}
      </button>
    </form>
  );
}
function IssueForm({
  detail,
  busy,
  onSave,
}: {
  detail: InvoiceDetail;
  busy: boolean;
  onSave: (v: Record<string, unknown>) => Promise<void>;
}) {
  const [reason, setReason] = useState(""),
    [error, setError] = useState("");
  return (
    <form
      className="invoice-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await onSave({
            operation: "issue",
            version: detail.invoice.version,
            reason,
          });
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Could not issue this invoice.",
          );
        }
      }}
    >
      <SectionTitle
        title="Confirm charge"
        help="Issuing assigns a permanent invoice number and makes the charge outstanding. It does not take payment or activate a membership. Changes afterward need an authorized correction."
      />
      <p>
        {detail.invoice.recipientName} · {detail.invoice.description}
      </p>
      <p>Due {detail.invoice.dueOn}</p>
      <p className="invoice-form-total">
        Charge{" "}
        <strong>
          {exactMoney(
            detail.invoice.totalMinor,
            detail.invoice.currency,
            detail.organization.locale,
          )}
        </strong>
      </p>
      <fieldset disabled={busy}>
        <label>
          Reason for issue
          <input
            required
            minLength={3}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label className="invoice-confirm">
          <input type="checkbox" required />
          Confirm issued charge
        </label>
      </fieldset>
      {error ? (
        <p role="alert" className="settings-error">
          {error}
        </p>
      ) : null}
      <button className="button primary" disabled={busy}>
        {busy ? "Issuing…" : "Confirm issue"}
      </button>
    </form>
  );
}
