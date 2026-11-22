"use client";
import Form from "next/form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { Drawer, Table, Pill } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/section-title";
import { useHydrated } from "@/lib/use-hydrated";
import { exactMoney } from "@/modules/billing/format";
import { ExpenseDrawer } from "./expense-drawer";
import type {
  ExpensesData,
  ExpenseCategory,
  ExpenseRow,
  ExpenseResult,
} from "./types";
export function ExpensesScreen({ initial }: { initial: ExpensesData }) {
  const [data, setData] = useState(initial),
    [tab, setTab] = useState("ledger"),
    [drawer, setDrawer] = useState(false),
    [replacement, setReplacement] = useState<ExpenseRow | undefined>(),
    [reverse, setReverse] = useState<ExpenseRow | null>(null),
    [category, setCategory] = useState<ExpenseCategory | "new" | null>(null),
    [pending, setPending] = useState(false),
    [blocked, setBlocked] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [retry, setRetry] = useState<{
      url: string;
      body: Record<string, unknown>;
    } | null>(null);
  const router = useRouter(),
    hydrated = useHydrated(),
    locked = !hydrated || pending || blocked || !!retry;
  const query = new URLSearchParams({
    organizationId: data.organization.id,
    branchId: data.branchId,
    from: data.from,
    to: data.to,
    categoryId: data.categoryId,
    kind: data.kind,
    q: data.q,
    page: String(data.page),
  });
  const money = (value: string, currency: string) =>
    (BigInt(value) < 0n ? "−" : "") +
    exactMoney(
      BigInt(value) < 0n ? (-BigInt(value)).toString() : value,
      currency,
      data.organization.locale,
    );
  const date = (value: string) =>
    new Intl.DateTimeFormat(data.organization.locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value + "T12:00:00Z"));
  async function refresh() {
    const r = await fetch("/api/expenses?" + query, { cache: "no-store" });
    const result = await r.json();
    if (!r.ok || !result.ok)
      throw Error(
        "Saved, but the expense ledger could not refresh. Reload before another change.",
      );
    setData(result.data);
  }
  async function saved(result: ExpenseResult) {
    setDrawer(false);
    setReplacement(undefined);
    setMessage(`${result.number} posted.`);
    try {
      await refresh();
    } catch (e) {
      setBlocked(true);
      setError(
        e instanceof Error ? e.message : "Reload to see the saved expense.",
      );
    }
  }
  async function mutate(url: string, body: Record<string, unknown>) {
    if (pending || blocked) return;
    setPending(true);
    setError("");
    setRetry({ url, body });
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok || !result.ok) {
        if (r.status < 500) setRetry(null);
        throw Error(result.error?.message ?? "Could not save this change.");
      }
      setRetry(null);
      setReverse(null);
      setCategory(null);
      setMessage(
        url.includes("reverse")
          ? "Expense reversed. Its original posting and receipt remain available."
          : "Expense category saved.",
      );
      try {
        await refresh();
      } catch (e) {
        setBlocked(true);
        throw e;
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save. Retry the same request safely.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <WorkspaceFrame
      organization={data.organization}
      active="expenses"
      canManageSettings={data.canManageSettings}
      canManageMembers={data.canManageMembers}
      canReadPlans={data.canReadPlans}
      canReadBilling={data.canReadBilling}
    >
      <section className="page-heading dashboard-heading">
        <div>
          <h1>Expenses</h1>
          <p>Know what it costs to run your gym.</p>
        </div>
        <button
          className="primary"
          disabled={locked || !data.categories.some((c) => c.active)}
          onClick={() => {
            setError("");
            setReplacement(undefined);
            setDrawer(true);
          }}
        >
          Add expense
        </button>
      </section>
      <div className="invoice-summary">
        {(
          [
            ["Posted expenses", "postedMinor"],
            ["Reversals", "reversedMinor"],
            ["Net cash expenses", "netMinor"],
          ] as const
        ).map(([title, key]) => (
          <section className="panel" key={key}>
            <SectionTitle
              title={title}
              help="Totals reflect all matching ledger entries in the selected cash-date period, including reversals of earlier expenses. Currencies are shown separately; changing a category name does not rewrite past postings."
            />
            {data.summary.length ? (
              data.summary.map((c) => (
                <p className="invoice-metric" key={c.currency}>
                  {money(c[key], c.currency)}
                </p>
              ))
            ) : (
              <p>No matching cash entries.</p>
            )}
          </section>
        ))}
      </div>
      {message ? (
        <p role="status" className="form-message">
          {message}
        </p>
      ) : null}
      {error && !reverse && !category ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {blocked ? (
        <section className="panel access-state">
          <p>Reload expenses before another change.</p>
          <button onClick={() => location.reload()}>Reload expenses</button>
        </section>
      ) : (
        <>
          <div
            className="invoice-tabs"
            role="tablist"
            aria-label="Expense views"
          >
            <button
              role="tab"
              aria-selected={tab === "ledger"}
              onClick={() => setTab("ledger")}
              disabled={pending || !!retry}
            >
              Cash ledger
            </button>
            <button
              role="tab"
              aria-selected={tab === "categories"}
              onClick={() => setTab("categories")}
              disabled={pending || !!retry}
            >
              Categories
            </button>
          </div>
          {tab === "ledger" ? (
            <>
              <Form action="/expenses" className="expense-filters">
                <input
                  type="hidden"
                  name="organizationId"
                  value={data.organization.id}
                />
                <label>
                  Branch
                  <select
                    name="branchId"
                    aria-label="Expense branch filter"
                    defaultValue={data.branchId}
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
                  From
                  <input name="from" type="date" defaultValue={data.from} />
                </label>
                <label>
                  Through
                  <input name="to" type="date" defaultValue={data.to} />
                </label>
                <label>
                  Category
                  <select
                    name="categoryId"
                    aria-label="Expense category filter"
                    defaultValue={data.categoryId}
                  >
                    <option value="">All categories</option>
                    {data.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.active ? "" : " (inactive)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Entry type
                  <select
                    name="kind"
                    aria-label="Entry type"
                    defaultValue={data.kind}
                  >
                    <option value="all">All entries</option>
                    <option value="expense">Postings</option>
                    <option value="reversal">Reversals</option>
                  </select>
                </label>
                <label>
                  Search
                  <input
                    name="q"
                    type="search"
                    maxLength={100}
                    defaultValue={data.q}
                    placeholder="Description, number or payee"
                  />
                </label>
                <button disabled={pending || !!retry} type="submit">
                  Apply filters
                </button>
              </Form>
              <section className="panel expense-ledger">
                <SectionTitle
                  title="Expense history"
                  help="Postings are immutable. A full reversal creates a separate negative entry on its own cash date. A replacement links to a reversed original; receipt downloads check your current role and branch."
                />
                <Table caption="Expense cash ledger">
                  <thead>
                    <tr>
                      <th>Date / number</th>
                      <th>Description</th>
                      <th>Category / branch</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Receipt / actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((e) => (
                      <tr key={e.kind + e.id}>
                        <td>
                          {date(e.cashOn)}
                          <small>{e.number}</small>
                        </td>
                        <td>
                          <strong>{e.description}</strong>
                          {e.payee ? <small>Paid to {e.payee}</small> : null}
                          {e.kind === "reversal" ? (
                            <>
                              <Pill tone="warning">Reversal</Pill>
                              <small>{e.reversalReason}</small>
                            </>
                          ) : e.reversed ? (
                            <small>Original posting · reversed</small>
                          ) : null}
                          {e.replacesExpenseId ? (
                            <small>Linked replacement posting</small>
                          ) : null}
                        </td>
                        <td>
                          {e.categoryName}
                          <small>{e.branchName}</small>
                        </td>
                        <td>{money(e.amountMinor, e.currency)}</td>
                        <td>
                          {e.method === "bank_transfer"
                            ? "Bank transfer"
                            : e.method === "cash"
                              ? "Cash"
                              : "Other"}
                          {e.reference ? <small>{e.reference}</small> : null}
                        </td>
                        <td>
                          <div className="expense-actions">
                            {e.fileId ? (
                              <a
                                href={`/api/files/${e.fileId}?organizationId=${data.organization.id}`}
                              >
                                Download receipt
                              </a>
                            ) : (
                              <small>No attachment</small>
                            )}
                            {e.kind === "expense" && !e.reversed ? (
                              <button
                                disabled={locked}
                                onClick={() => {
                                  setError("");
                                  setReverse(e);
                                }}
                              >
                                Reverse {e.number}
                              </button>
                            ) : e.kind === "expense" && !e.replacementId ? (
                              <button
                                disabled={
                                  locked ||
                                  !data.categories.some((c) => c.active)
                                }
                                onClick={() => {
                                  setReplacement(e);
                                  setDrawer(true);
                                }}
                              >
                                Replace {e.number}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {!data.rows.length ? (
                  <p className="attendance-empty">
                    No expenses match these filters.
                  </p>
                ) : null}
                <nav aria-label="Expense pages" className="member-pagination">
                  <span>
                    {data.total} entries · Page {data.page}
                  </span>
                  <button
                    disabled={locked || data.page <= 1}
                    onClick={() => {
                      query.set("page", String(data.page - 1));
                      router.push("/expenses?" + query);
                    }}
                  >
                    Previous
                  </button>
                  <button
                    disabled={locked || data.page * 25 >= data.total}
                    onClick={() => {
                      query.set("page", String(data.page + 1));
                      router.push("/expenses?" + query);
                    }}
                  >
                    Next
                  </button>
                </nav>
              </section>
            </>
          ) : (
            <section className="panel expense-ledger">
              <div className="platform-section-heading">
                <SectionTitle
                  title="Expense categories"
                  help="Categories are shared within your gym. Deactivation stops new postings, while earlier entries retain their saved category name. Changes use versions to prevent stale overwrites."
                />
                <button
                  disabled={locked}
                  onClick={() => {
                    setError("");
                    setCategory("new");
                  }}
                >
                  Add category
                </button>
              </div>
              <Table caption="Expense categories">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.active ? "Active" : "Inactive"}</td>
                      <td>
                        <button
                          disabled={locked}
                          onClick={() => {
                            setError("");
                            setCategory(c);
                          }}
                        >
                          Edit {c.name}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {!data.categories.length ? (
                <p className="attendance-empty">
                  Create a category before posting your first expense.
                </p>
              ) : null}
            </section>
          )}
        </>
      )}
      {drawer ? (
        <ExpenseDrawer
          data={data}
          replacement={replacement}
          onClose={() => {
            setDrawer(false);
            setReplacement(undefined);
          }}
          onSaved={saved}
        />
      ) : null}
      {reverse ? (
        <Drawer
          title="Reverse expense"
          busy={pending || !!retry}
          onClose={() => setReverse(null)}
        >
          <form
            className="invoice-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void (retry
                ? mutate(retry.url, retry.body)
                : mutate(`/api/expenses/${reverse.expenseId}/reverse`, {
                    organizationId: data.organization.id,
                    requestKey: crypto.randomUUID(),
                    cashOn: String(form.get("cashOn")),
                    reason: String(form.get("reason")),
                  }));
            }}
          >
            <SectionTitle
              title="Full cash reversal"
              help="This retains the original expense and adds an equal negative entry. Record the actual reversal cash date and reason. A corrected replacement can then be posted separately."
            />
            <p>
              {reverse.number} · {reverse.description}
            </p>
            <strong>{money(reverse.amountMinor, reverse.currency)}</strong>
            <label>
              Reversal cash date
              <input
                type="date"
                name="cashOn"
                min={reverse.cashOn}
                max={data.today}
                defaultValue={data.today}
                disabled={pending || !!retry}
                required
              />
            </label>
            <label>
              Reason for reversal
              <textarea
                name="reason"
                minLength={3}
                maxLength={300}
                disabled={pending || !!retry}
                required
              />
            </label>
            {error ? (
              <p role="alert" className="form-error">
                {error}
              </p>
            ) : null}
            <button className="primary" disabled={pending}>
              {pending
                ? "Reversing…"
                : retry
                  ? "Retry same reversal"
                  : "Confirm reversal"}
            </button>
          </form>
        </Drawer>
      ) : null}
      {category ? (
        <Drawer
          title={
            category === "new"
              ? "Add expense category"
              : "Edit expense category"
          }
          busy={pending || !!retry}
          onClose={() => setCategory(null)}
        >
          <form
            className="invoice-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void (retry
                ? mutate(retry.url, retry.body)
                : mutate("/api/expenses/categories", {
                    organizationId: data.organization.id,
                    id: category === "new" ? crypto.randomUUID() : category.id,
                    operation: category === "new" ? "create" : "update",
                    name: String(form.get("name")),
                    reason: String(form.get("reason")),
                    ...(category !== "new"
                      ? {
                          active: form.get("active") === "on",
                          version: category.version,
                        }
                      : {}),
                  }));
            }}
          >
            <label>
              Category name
              <input
                name="name"
                maxLength={80}
                defaultValue={category === "new" ? "" : category.name}
                disabled={pending || !!retry}
                required
              />
            </label>
            {category !== "new" ? (
              <label className="checkbox-field">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={category.active}
                  disabled={pending || !!retry}
                />
                Active for new expenses
              </label>
            ) : null}
            <label>
              Reason for category change
              <textarea
                name="reason"
                minLength={3}
                maxLength={300}
                disabled={pending || !!retry}
                required
              />
            </label>
            {error ? (
              <p role="alert" className="form-error">
                {error}
              </p>
            ) : null}
            <button className="primary" disabled={pending}>
              {pending
                ? "Saving…"
                : retry
                  ? "Retry same category"
                  : "Save category"}
            </button>
          </form>
        </Drawer>
      ) : null}
    </WorkspaceFrame>
  );
}
