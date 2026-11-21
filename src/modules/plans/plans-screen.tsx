"use client";
import { useState } from "react";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { SectionTitle } from "@/components/ui/section-title";
import { Drawer } from "@/components/ui/primitives";
import { useHydrated } from "@/lib/use-hydrated";
import {
  amountInput,
  parseAmount,
  money,
  term,
  endOn,
  previousDay,
} from "./format";
import type { Catalog, Plan, VersionHistory } from "./types";
import type { PlanQuery, VersionValues } from "./schemas";
async function readCatalog(q: PlanQuery): Promise<Catalog> {
  const qs = new URLSearchParams({
    organizationId: q.organizationId!,
    status: q.status,
    page: String(q.page),
    q: q.q,
  });
  if (q.branchId) qs.set("branchId", q.branchId);
  const r = await fetch("/api/plans?" + qs, { cache: "no-store" }),
    j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? "Could not load plans.");
  return j.data;
}
function benefits(v: VersionValues) {
  return [
    v.gymFloor ? "Gym floor access" : "",
    v.classes ? "Classes" : "",
    v.personalTraining ? "Personal training" : "",
  ].filter(Boolean);
}
export function PlansScreen({ initial }: { initial: Catalog }) {
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false),
    [reloadRequired, setReloadRequired] = useState(false),
    [q, setQ] = useState(initial.query.q),
    [lastQuery, setLastQuery] = useState(initial.query);
  const [editor, setEditor] = useState<{ plan?: Plan; key: string } | null>(
      null,
    ),
    [archive, setArchive] = useState<Plan | null>(null),
    [history, setHistory] = useState<{
      id: string;
      name: string;
      data?: VersionHistory;
    } | null>(null);
  const hydrated = useHydrated(),
    locked = busy || reloadRequired || !hydrated;
  function apply(next: Catalog) {
    setData(next);
    setFailed(false);
    setReloadRequired(false);
    const p = new URLSearchParams({
      organizationId: next.organization.id,
      status: next.query.status,
      page: String(next.page),
    });
    if (next.query.branchId) p.set("branchId", next.query.branchId);
    window.history.replaceState(null, "", "/plans?" + p);
  }
  async function load(query: PlanQuery) {
    setBusy(true);
    setError("");
    setLastQuery(query);
    try {
      apply(await readCatalog(query));
    } catch (e) {
      setFailed(true);
      setError(e instanceof Error ? e.message : "Could not load plans.");
    } finally {
      setBusy(false);
    }
  }
  async function save(path: string, method: string, body: unknown) {
    if (locked) return;
    setBusy(true);
    setError("");
    setMessage("");
    let committed = false;
    try {
      const r = await fetch(path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        j = await r.json();
      if (!r.ok) throw new Error(j.error?.message ?? "Could not save plans.");
      committed = true;
      apply(await readCatalog(data.query));
      setEditor(null);
      setArchive(null);
      setMessage("Plan changes saved. Previous versions are preserved.");
    } catch (e) {
      if (committed) {
        setEditor(null);
        setArchive(null);
        setReloadRequired(true);
        setMessage("Plan saved.");
        setError(
          "Could not refresh saved records. Reload latest before editing again.",
        );
      } else
        setError(
          e instanceof TypeError
            ? "Could not reach the server. Your inputs are kept. Retry the same draft to check the save safely."
            : e instanceof Error
              ? e.message
              : "Could not save plans.",
        );
    } finally {
      setBusy(false);
    }
  }
  async function showHistory(plan: Plan, page = 1) {
    setBusy(true);
    setError("");
    setHistory({ id: plan.id, name: plan.current.name });
    try {
      const r = await fetch(
          `/api/plans/${plan.id}?organizationId=${data.organization.id}&versionPage=${page}`,
          { cache: "no-store" },
        ),
        j = await r.json();
      if (!r.ok)
        throw new Error(j.error?.message ?? "Could not load versions.");
      setHistory({ id: plan.id, name: plan.current.name, data: j.data });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load versions.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceFrame
      organization={data.organization}
      canManageSettings={data.canManageSettings}
      canManageMembers={data.canManageMembers}
      active="plans"
    >
      <header className="plan-heading">
        <div>
          <h1>Membership plans</h1>
          <p>Set pricing, access and renewal terms.</p>
        </div>
        {data.canManage ? (
          <button
            className="button primary"
            disabled={locked}
            onClick={() => {
              setError("");
              setEditor({ key: crypto.randomUUID() });
            }}
          >
            Create plan
          </button>
        ) : null}
      </header>
      <div className="plan-tabs" aria-label="Plan status">
        {(["active", "archived"] as const).map((status) => (
          <button
            key={status}
            className={data.query.status === status ? "selected" : ""}
            aria-pressed={data.query.status === status}
            disabled={busy}
            onClick={() => load({ ...data.query, status, page: 1 })}
          >
            {status === "active" ? "Active plans" : "Archived"}
          </button>
        ))}
      </div>
      <form
        className="plan-filters"
        onSubmit={(e) => {
          e.preventDefault();
          load({ ...data.query, q, page: 1 });
        }}
      >
        <label>
          Search plans
          <input
            value={q}
            maxLength={100}
            placeholder="Plan name or code"
            onChange={(e) => setQ(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Branch
          <select
            value={data.query.branchId ?? ""}
            disabled={busy}
            onChange={(e) =>
              load({
                ...data.query,
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
        <button className="button secondary" disabled={busy}>
          Search
        </button>
        {q || data.query.branchId ? (
          <button
            className="text-action"
            type="button"
            disabled={busy}
            onClick={() => {
              setQ("");
              load({ ...data.query, q: "", branchId: undefined, page: 1 });
            }}
          >
            Clear filters
          </button>
        ) : null}
      </form>
      {message ? (
        <p role="status" className="settings-success">
          {message}
        </p>
      ) : null}
      {error && !editor && !archive && !history ? (
        <div role="alert" className="settings-error">
          {error}
        </div>
      ) : null}
      {failed || reloadRequired ? (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => load(reloadRequired ? data.query : lastQuery)}
        >
          Reload latest
        </button>
      ) : null}
      {busy && !editor && !archive && !history ? (
        <p role="status">Loading plans…</p>
      ) : null}
      {!failed ? (
        <>
          <section
            aria-label="Plan catalog"
            className="plan-grid"
            aria-busy={busy}
          >
            {data.plans.map((p) => (
              <article className="panel plan-card" key={p.id}>
                <div className="plan-card-heading">
                  <h2>{p.current.name}</h2>
                  <span
                    className={"pill " + (p.archivedAt ? "warning" : "success")}
                  >
                    {p.archivedAt ? "Archived" : "Enabled"}
                  </span>
                </div>
                <p className="plan-price">
                  {money(
                    p.current.amountMinor,
                    p.current.currency,
                    data.organization.locale,
                  )}
                </p>
                <p className="plan-term">
                  Every {term(p.current.durationCount, p.current.durationUnit)}
                </p>
                <p className="plan-code">
                  {p.code} · {p.branchName} · Version {p.current.version}
                </p>
                <ul className="plan-benefits">
                  {benefits(p.current).map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <p className="plan-access">
                  {p.current.accessMode === "all_branches"
                    ? "Access across all gym branches"
                    : "Access at the member’s home branch"}
                </p>
                <div className="plan-card-actions">
                  {data.canManage && !p.archivedAt ? (
                    <button
                      className="text-action"
                      disabled={locked}
                      onClick={() => {
                        setError("");
                        setEditor({ plan: p, key: crypto.randomUUID() });
                      }}
                    >
                      Edit plan
                    </button>
                  ) : null}
                  <button
                    className="text-action"
                    disabled={busy || !hydrated}
                    onClick={() => showHistory(p)}
                  >
                    Version history
                  </button>
                  {data.canManage ? (
                    <button
                      className="text-action"
                      disabled={locked}
                      onClick={() => {
                        setError("");
                        setArchive(p);
                      }}
                    >
                      {p.archivedAt ? "Restore plan" : "Archive plan"}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
          {data.total === 0 ? (
            <section className="panel plan-empty">
              <h2>
                {data.query.q || data.query.branchId
                  ? "No matching plans"
                  : data.query.status === "archived"
                    ? "No archived plans"
                    : "Create your first plan"}
              </h2>
              <p>
                {data.canManage
                  ? "Set a price, duration and access benefits for your gym."
                  : "An owner or manager can publish plans for your branch."}
              </p>
            </section>
          ) : null}
          <div className="plan-pagination">
            <span>
              {data.total} plans · Page {data.page} of{" "}
              {Math.max(1, Math.ceil(data.total / data.pageSize))}
            </span>
            <button
              className="button secondary"
              disabled={busy || data.page === 1}
              onClick={() => load({ ...data.query, page: data.page - 1 })}
            >
              Previous plans
            </button>
            <button
              className="button secondary"
              disabled={busy || data.page * data.pageSize >= data.total}
              onClick={() => load({ ...data.query, page: data.page + 1 })}
            >
              Next plans
            </button>
          </div>
        </>
      ) : null}
      <section className="panel plan-guidance">
        <SectionTitle
          title="Plan versions"
          help="Each saved change publishes an immutable version. Existing versions retain their name, rate, duration and access benefits. Archiving prevents new enrollment without removing history."
        />
        <p>
          Changes apply to future memberships. Enroll and renew from a member’s
          profile; existing memberships retain their saved rate and access.
        </p>
        {!data.canManage ? <p>Your access is read-only.</p> : null}
      </section>
      {editor ? (
        <Drawer
          title={editor.plan ? "Publish a new plan version" : "Create plan"}
          onClose={() => {
            setEditor(null);
            setError("");
          }}
          busy={busy}
        >
          <PlanEditor
            key={editor.key}
            data={data}
            plan={editor.plan}
            busy={busy}
            locked={reloadRequired}
            error={error}
            onSave={(values) =>
              save("/api/plans", editor.plan ? "PATCH" : "POST", {
                organizationId: data.organization.id,
                requestKey: editor.key,
                ...values,
                ...(editor.plan
                  ? { id: editor.plan.id, revision: editor.plan.revision }
                  : {}),
              })
            }
          />
        </Drawer>
      ) : null}
      {archive ? (
        <Drawer
          title={archive.archivedAt ? "Restore plan" : "Archive plan"}
          onClose={() => {
            setArchive(null);
            setError("");
          }}
          busy={busy}
        >
          <p>
            {archive.archivedAt
              ? "Restoring makes this version available again. It does not enroll or charge anyone."
              : "Archiving prevents new enrollment. Previous versions and membership history stay preserved."}
          </p>
          <form
            className="plan-editor"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              save(`/api/plans/${archive.id}/archive`, "POST", {
                organizationId: data.organization.id,
                revision: archive.revision,
                archived: !archive.archivedAt,
                reason: f.get("reason"),
              });
            }}
          >
            <label>
              Reason
              <textarea
                name="reason"
                required
                minLength={3}
                maxLength={300}
                disabled={busy}
              />
            </label>
            {error ? (
              <p role="alert" className="settings-error">
                {error}
              </p>
            ) : null}
            <button className="button primary" disabled={busy}>
              {archive.archivedAt ? "Confirm restore" : "Confirm archive"}
            </button>
          </form>
        </Drawer>
      ) : null}
      {history ? (
        <Drawer
          title={"Version history — " + history.name}
          onClose={() => {
            setHistory(null);
            setError("");
          }}
          busy={busy}
        >
          {error ? (
            <p role="alert" className="settings-error">
              {error}
            </p>
          ) : null}
          {busy ? <p role="status">Loading versions…</p> : null}
          {history.data ? (
            <>
              <p>Published versions are read-only.</p>
              <div className="plan-history">
                {history.data.versions.map((v) => (
                  <article className="panel" key={v.id}>
                    <h3>
                      Version {v.version} · {v.name}
                    </h3>
                    <p>
                      {money(
                        v.amountMinor,
                        v.currency,
                        data.organization.locale,
                      )}{" "}
                      · {term(v.durationCount, v.durationUnit)}
                    </p>
                    <p>{benefits(v).join(", ")}</p>
                    <p>
                      {v.accessMode === "all_branches"
                        ? "All gym branches"
                        : "Member home branch"}
                    </p>
                    <p>{v.reason}</p>
                    <time dateTime={v.createdAt}>
                      {new Intl.DateTimeFormat(data.organization.locale, {
                        timeZone: data.organization.timeZone,
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(v.createdAt))}
                    </time>
                  </article>
                ))}
              </div>
              <p>
                {history.data.total} versions · Page {history.data.page}
              </p>
              <button
                disabled={busy || history.data.page === 1}
                onClick={() =>
                  showHistory(history.data!.plan, history.data!.page - 1)
                }
              >
                Previous versions
              </button>
              <button
                disabled={busy || history.data.page * 20 >= history.data.total}
                onClick={() =>
                  showHistory(history.data!.plan, history.data!.page + 1)
                }
              >
                Next versions
              </button>
            </>
          ) : !busy ? (
            <button
              className="button secondary"
              onClick={() =>
                showHistory(data.plans.find((p) => p.id === history.id)!)
              }
            >
              Retry versions
            </button>
          ) : null}
        </Drawer>
      ) : null}
    </WorkspaceFrame>
  );
}
function PlanEditor({
  data,
  plan,
  busy,
  locked,
  error,
  onSave,
}: {
  data: Catalog;
  plan?: Plan;
  busy: boolean;
  locked: boolean;
  error: string;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [v, setV] = useState<VersionValues>(
    plan
      ? { ...plan.current, currency: data.organization.currency }
      : {
          name: "",
          amountMinor: 0,
          currency: data.organization.currency,
          durationUnit: "months",
          durationCount: 1,
          accessMode: "home_branch",
          gymFloor: true,
          classes: false,
          personalTraining: false,
        },
  );
  const [price, setPrice] = useState(
      plan ? amountInput(plan.current.amountMinor, plan.current.currency) : "",
    ),
    [start, setStart] = useState(data.today),
    [localError, setLocalError] = useState("");
  let preview = "";
  try {
    const end = endOn(start, v.durationCount, v.durationUnit);
    preview = `Access from ${start} through ${previousDay(end)}. Exclusive end: ${end}.`;
  } catch {}
  return (
    <form
      className="plan-editor"
      onSubmit={(e) => {
        e.preventDefault();
        setLocalError("");
        try {
          const f = new FormData(e.currentTarget);
          onSave({
            values: {
              name: v.name,
              amountMinor: parseAmount(price, v.currency),
              currency: v.currency,
              durationUnit: v.durationUnit,
              durationCount: v.durationCount,
              accessMode: v.accessMode,
              gymFloor: v.gymFloor,
              classes: v.classes,
              personalTraining: v.personalTraining,
            },
            reason: f.get("reason"),
            ...(!plan
              ? { code: f.get("code"), branchId: f.get("branchId") }
              : {}),
          });
        } catch (e) {
          setLocalError(
            e instanceof Error ? e.message : "Check the plan details.",
          );
        }
      }}
    >
      <fieldset disabled={busy || locked}>
        {plan ? (
          <p>
            Saving publishes version {plan.current.version + 1}. Earlier rates
            and access remain unchanged.
          </p>
        ) : null}
        {!plan ? (
          <>
            <label>
              Plan code
              <input
                name="code"
                required
                maxLength={24}
                pattern="[A-Za-z0-9][A-Za-z0-9\-]{0,23}"
                placeholder="MONTHLY"
              />
            </label>
            <label>
              Plan branch
              <select
                aria-label="Plan branch"
                name="branchId"
                defaultValue={data.query.branchId ?? data.branches[0]?.id}
                required
              >
                {data.branches.map((b) => (
                  <option value={b.id} key={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <p>
            {plan.code} · {plan.branchName}
          </p>
        )}
        <label>
          Plan name
          <input
            required
            maxLength={100}
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
          />
        </label>
        <label>
          Price ({v.currency})
          <input
            required
            inputMode="decimal"
            maxLength={30}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="4500.00"
          />
        </label>
        <div className="plan-form-columns">
          <label>
            Duration
            <input
              type="number"
              required
              min={1}
              max={v.durationUnit === "months" ? 120 : 3650}
              value={v.durationCount || ""}
              onChange={(e) =>
                setV({ ...v, durationCount: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Duration unit
            <select
              value={v.durationUnit}
              onChange={(e) =>
                setV({
                  ...v,
                  durationUnit: e.target.value as VersionValues["durationUnit"],
                })
              }
            >
              <option value="months">Calendar months</option>
              <option value="days">Fixed days</option>
            </select>
          </label>
        </div>
        <SectionTitle
          title="Access benefits"
          help="Choose the benefits this plan includes. Class bookings and personal training schedules will use these entitlements when their modules are connected."
        />
        {(["gymFloor", "classes", "personalTraining"] as const).map((k, i) => (
          <label className="plan-check" key={k}>
            <input
              type="checkbox"
              checked={v[k]}
              onChange={(e) => setV({ ...v, [k]: e.target.checked })}
            />
            {["Gym floor access", "Classes", "Personal training"][i]}
          </label>
        ))}
        <label>
          Branch access
          <select
            value={v.accessMode}
            onChange={(e) =>
              setV({
                ...v,
                accessMode: e.target.value as VersionValues["accessMode"],
              })
            }
          >
            <option value="home_branch">Member home branch</option>
            {data.canUseAllBranches || v.accessMode === "all_branches" ? (
              <option value="all_branches" disabled={!data.canUseAllBranches}>
                All gym branches (owner)
              </option>
            ) : null}
          </select>
        </label>
        <SectionTitle
          title="Term preview"
          help="Calendar months clamp to a valid month-end date. Fixed days count local calendar days. The end date is exclusive. This preview does not enroll anyone."
        />
        <label>
          Preview start date
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <p className="plan-preview">
          {preview || "Choose a valid date and duration to preview the term."}
        </p>
        <label>
          Reason
          <textarea name="reason" required minLength={3} maxLength={300} />
        </label>
      </fieldset>
      {localError || error ? (
        <p role="alert" className="settings-error">
          {localError || error}
        </p>
      ) : null}
      <button className="button primary" disabled={busy || locked}>
        {busy ? "Saving…" : plan ? "Publish version" : "Save plan"}
      </button>
    </form>
  );
}
