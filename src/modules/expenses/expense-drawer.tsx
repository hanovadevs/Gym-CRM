"use client";
import { useState } from "react";
import { Drawer } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/section-title";
import { parseAmount, amountInput } from "@/modules/plans/format";
import { exactMoney } from "@/modules/billing/format";
import type { ExpensesData, ExpenseRow, ExpenseResult } from "./types";
type Attempt = {
  body: Record<string, unknown>;
  file: File | null;
  fileKey: string;
  fileId?: string;
};
export function ExpenseDrawer({
  data,
  replacement,
  onClose,
  onSaved,
}: {
  data: ExpensesData;
  replacement?: ExpenseRow;
  onClose: () => void;
  onSaved: (result: ExpenseResult) => Promise<void>;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState<Attempt | null>(null),
    [uncertain, setUncertain] = useState(false);
  const currency = replacement?.currency ?? data.organization.currency;
  async function confirm(a: Attempt) {
    if (pending) return;
    setPending(true);
    setError("");
    setUncertain(false);
    try {
      let fileId = a.fileId;
      if (a.file && !fileId) {
        const q = new URLSearchParams({
          organizationId: data.organization.id,
          branchId: String(a.body.branchId),
          filename: a.file.name,
          requestKey: a.fileKey,
        });
        const r = await fetch("/api/files?" + q, {
          method: "POST",
          headers: { "Content-Type": a.file.type },
          body: a.file,
        });
        const result = await r.json();
        if (!r.ok || !result.ok) {
          if (r.status < 500) setAttempt(null);
          throw Error(result.error?.message ?? "Could not upload receipt.");
        }
        fileId = result.data.id;
        setAttempt({ ...a, fileId });
      }
      const r = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...a.body, ...(fileId ? { fileId } : {}) }),
      });
      const result = await r.json();
      if (!r.ok || !result.ok) {
        if (r.status < 500) setAttempt(null);
        throw Error(result.error?.message ?? "Could not post expense.");
      }
      await onSaved(result.data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Expense unavailable. Try again.",
      );
      setUncertain(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <Drawer
      title={replacement ? "Replace reversed expense" : "Add expense"}
      busy={pending || (uncertain && !!attempt)}
      onClose={onClose}
    >
      <form
        className="invoice-form"
        hidden={!!attempt}
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          const form = new FormData(e.currentTarget);
          try {
            const amountMinor = String(
              parseAmount(String(form.get("amount")), currency),
            );
            if (amountMinor === "0")
              throw Error("Enter an amount greater than zero.");
            const file = form.get("receipt");
            const attachment = file instanceof File && file.size ? file : null;
            if (
              attachment &&
              (attachment.size > 2097152 ||
                !["image/png", "image/jpeg"].includes(attachment.type))
            )
              throw Error("Choose a PNG or JPEG receipt, at most 2MB.");
            setUncertain(false);
            setAttempt({
              body: {
                organizationId: data.organization.id,
                branchId: replacement?.branchId ?? String(form.get("branchId")),
                categoryId: String(form.get("categoryId")),
                requestKey: crypto.randomUUID(),
                description: String(form.get("description")),
                payee: String(form.get("payee")),
                amountMinor,
                currency,
                paidOn: String(form.get("paidOn")),
                method: String(form.get("method")),
                reference: String(form.get("reference")),
                ...(replacement
                  ? { replacesExpenseId: replacement.expenseId }
                  : {}),
              },
              file: attachment,
              fileKey: crypto.randomUUID(),
            });
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Check the expense fields.",
            );
          }
        }}
      >
        <SectionTitle
          title="Cash expense"
          help="Record money actually spent. Posted amounts are retained permanently; correct an error through a full reversal and a linked replacement. Receipt images are private and do not email themselves."
        />
        {replacement ? (
          <p>
            Replacement for {replacement.number}. The original and its reversal
            remain in the ledger.
          </p>
        ) : null}
        <label>
          Branch
          <select
            aria-label="Expense branch"
            name="branchId"
            defaultValue={
              replacement?.branchId ?? (data.branchId || data.branches[0]?.id)
            }
            disabled={!!replacement}
          >
            {data.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select
            aria-label="Expense category"
            name="categoryId"
            required
            defaultValue={replacement?.categoryId ?? ""}
          >
            <option value="" disabled>
              Choose a category
            </option>
            {data.categories
              .filter((c) => c.active)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Description
          <input
            name="description"
            minLength={3}
            maxLength={300}
            required
            defaultValue={replacement?.description ?? ""}
          />
        </label>
        <label>
          Paid to
          <input
            name="payee"
            maxLength={120}
            defaultValue={replacement?.payee ?? ""}
          />
        </label>
        <label>
          Amount ({currency})
          <input
            name="amount"
            inputMode="decimal"
            required
            defaultValue={
              replacement
                ? amountInput(Number(replacement.amountMinor), currency)
                : ""
            }
          />
        </label>
        <label>
          Cash date
          <input
            type="date"
            name="paidOn"
            required
            defaultValue={data.today}
            max={data.today}
          />
        </label>
        <label>
          Payment method
          <select
            name="method"
            aria-label="Expense payment method"
            defaultValue={replacement?.method ?? "cash"}
          >
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Reference
          <input
            name="reference"
            maxLength={100}
            defaultValue={replacement?.reference ?? ""}
          />
        </label>
        <label>
          Receipt image (optional)
          <input type="file" name="receipt" accept="image/png,image/jpeg" />
        </label>
        <p>
          PNG or JPEG, at most 2MB. Images are validated and metadata is removed
          before private storage.
        </p>
        <button className="primary" type="submit">
          Review expense
        </button>
      </form>
      {attempt ? (
        <section className="invoice-form">
          <SectionTitle
            title="Review before posting"
            help="This creates a cash ledger entry. Check its branch, amount and date before confirming."
          />
          <dl className="invoice-facts">
            <dt>Description</dt>
            <dd>{String(attempt.body.description)}</dd>
            <dt>Amount</dt>
            <dd>
              {exactMoney(
                String(attempt.body.amountMinor),
                currency,
                data.organization.locale,
              )}
            </dd>
            <dt>Branch</dt>
            <dd>
              {data.branches.find((b) => b.id === attempt.body.branchId)?.name}
            </dd>
            <dt>Category</dt>
            <dd>
              {
                data.categories.find((c) => c.id === attempt.body.categoryId)
                  ?.name
              }
            </dd>
            <dt>Cash date</dt>
            <dd>{String(attempt.body.paidOn)}</dd>
            <dt>Receipt</dt>
            <dd>{attempt.file?.name ?? "No attachment"}</dd>
          </dl>
          <button
            className="primary"
            disabled={pending}
            onClick={() => confirm(attempt)}
          >
            {pending
              ? "Posting…"
              : uncertain
                ? "Retry same expense"
                : "Confirm expense"}
          </button>
          {!uncertain ? (
            <button disabled={pending} onClick={() => setAttempt(null)}>
              Back to edit
            </button>
          ) : (
            <p>The submitted request is retained for safe retry.</p>
          )}
        </section>
      ) : null}
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
    </Drawer>
  );
}
