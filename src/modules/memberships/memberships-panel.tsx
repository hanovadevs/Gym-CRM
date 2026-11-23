"use client";
import Link from "next/link";
import { invalidateMemberFeeViews } from "@/modules/member-fees/invalidate";
import { useState } from "react";
import { SectionTitle } from "@/components/ui/section-title";
import { Drawer } from "@/components/ui/primitives";
import { useHydrated } from "@/lib/use-hydrated";
import {
  money,
  term,
  endOn,
  previousDay,
  parseAmount,
  amountInput,
} from "@/modules/plans/format";
import { daysBetween, eligibilityLabel } from "./state";
import type {
  MembershipContext,
  Membership,
  EnrollmentPreview,
  Freeze,
} from "./types";
type Editor =
  | { kind: "enroll" | "renew"; key: string }
  | {
      kind: "activate" | "freeze" | "reverse_freeze" | "cancel";
      key: string;
      membership: Membership;
      freeze?: Freeze;
    };
export function MembershipsPanel({
  initial,
  onChanged,
  onBlock,
}: {
  initial: MembershipContext;
  onChanged: () => Promise<void>;
  onBlock: () => void;
}) {
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false),
    [readError, setReadError] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [editor, setEditor] = useState<Editor | null>(null);
  const hydrated = useHydrated(),
    locked = busy || blocked || readError || !hydrated;
  const base = `/api/members/${data.memberId}/memberships`;
  async function fetchContext(page = data.page) {
    const r = await fetch(
        base + `?organizationId=${data.organizationId}&page=${page}`,
        { cache: "no-store" },
      ),
      j = await r.json();
    if (!r.ok)
      throw new Error(j.error?.message ?? "Could not reload memberships.");
    setData(j.data);
    setBlocked(false);
    setReadError(false);
  }
  async function reload(page = data.page) {
    setBusy(true);
    setError("");
    try {
      await fetchContext(page);
      if (blocked) await onChanged();
    } catch (e) {
      setReadError(true);
      setError(
        e instanceof Error ? e.message : "Could not reload memberships.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(body: Record<string, unknown>, enroll: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    let committed = false;
    try {
      const r = await fetch(base, {
          method: enroll ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId: data.organizationId,
            memberVersion: data.memberVersion,
            requestKey: editor!.key,
            ...body,
          }),
        }),
        j = await r.json();
      if (!r.ok)
        throw new Error(j.error?.message ?? "Could not save membership.");
      committed = true;
      setEditor(null);
      await fetchContext();
      await onChanged();
      const cacheUpdated = await invalidateMemberFeeViews(
        data.organizationId,
      ).then(
        () => true,
        () => false,
      );
      setMessage(
        cacheUpdated
          ? "Membership changes saved."
          : "Membership changes saved. Refresh the dashboard and fee schedule to see this change.",
      );
    } catch (e) {
      if (committed) {
        setEditor(null);
        setBlocked(true);
        onBlock();
        setMessage("Membership changes saved.");
        setError(
          "Could not refresh saved memberships. Reload latest before changing anything else.",
        );
      } else
        setError(
          e instanceof TypeError
            ? "Could not reach the server. Your inputs are kept. Retry the same request to check the result safely."
            : e instanceof Error
              ? e.message
              : "Could not save membership.",
        );
    } finally {
      setBusy(false);
    }
  }
  const date = (v: string) =>
    new Intl.DateTimeFormat(data.locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(v + "T12:00:00Z"));
  function open(editor: Editor) {
    setError("");
    setMessage("");
    setEditor(editor);
  }
  return (
    <section className="panel membership-panel" aria-label="Memberships">
      <div className="membership-panel-heading">
        <div>
          <SectionTitle
            title="Membership"
            help="Membership dates, activation and invoices are separate. Enrollment issues a charge and preserves the selected plan version. Cancellation keeps the invoice; a freeze extends the term once."
          />
          <p className="membership-access">
            {eligibilityLabel(data.eligibility)}
          </p>
        </div>
        <button
          className="button primary"
          disabled={locked || data.archived || data.planCount === 0}
          onClick={() =>
            open({
              kind: data.hasHistory ? "renew" : "enroll",
              key: crypto.randomUUID(),
            })
          }
        >
          {data.hasHistory ? "Renew membership" : "Enroll member"}
        </button>
      </div>
      {data.monthlyFee ? (
        <section className="membership-review" aria-label="Agreed monthly fee">
          <strong>
            Agreed monthly fee:{" "}
            {money(
              Number(data.monthlyFee.amountMinor),
              data.monthlyFee.currency,
              data.locale,
            )}
          </strong>
          <p>
            Starts {date(data.monthlyFee.startOn)}.{" "}
            {data.monthlyFee.dueOn
              ? (data.monthlyFee.dueKind === "invoice"
                  ? "Invoice due "
                  : "Renewal due ") + date(data.monthlyFee.dueOn)
              : "No upcoming fee reminder."}
          </p>
          <p>
            Reminders begin {data.monthlyFee.reminderDays} days before due.
            Renewals retain this member’s agreed fee; existing invoices and
            payments remain unchanged.
          </p>
        </section>
      ) : null}
      {data.archived ? (
        <p className="support">
          Archived members cannot enroll or change access. Their membership and
          invoice history is retained.
        </p>
      ) : !data.planCount ? (
        <p className="support">
          No active plan in this home branch uses the gym’s current currency.{" "}
          <Link
            className="text-action"
            href={"/plans?organizationId=" + data.organizationId}
          >
            Open plans
          </Link>{" "}
          before enrolling.
        </p>
      ) : null}
      {message ? (
        <p role="status" className="settings-success">
          {message}
        </p>
      ) : null}
      {error && !editor ? (
        <p role="alert" className="settings-error">
          {error}
        </p>
      ) : null}
      {blocked || readError ? (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => reload()}
        >
          Reload memberships
        </button>
      ) : null}
      {!blocked && !readError ? (
        <>
          {data.memberships.length ? (
            <div className="membership-records">
              {data.memberships.map((m) => (
                <article
                  key={m.id}
                  className="membership-record"
                  aria-label={
                    "Membership " + m.snapshot.name + " from " + m.startOn
                  }
                >
                  <div className="membership-record-heading">
                    <div>
                      <h3>{m.snapshot.name}</h3>
                      <p>
                        Plan version {m.snapshot.planVersion} ·{" "}
                        {term(
                          m.snapshot.durationCount,
                          m.snapshot.durationUnit,
                        )}
                      </p>
                    </div>
                    <span
                      className={
                        "pill " +
                        (m.status === "Active" ? "success" : "warning")
                      }
                    >
                      {m.status}
                    </span>
                  </div>
                  <dl className="membership-facts">
                    <div>
                      <dt>Membership dates</dt>
                      <dd>
                        {date(m.startOn)} — {date(previousDay(m.endOn))}
                        <small>Exclusive end: {m.endOn}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Issued invoice</dt>
                      <dd>
                        <Link
                          className="text-action"
                          href={`/payments?organizationId=${data.organizationId}&invoiceId=${m.invoice.id}`}
                        >
                          {m.invoice.number}
                        </Link>
                        <small>
                          {money(
                            m.invoice.totalMinor,
                            m.invoice.currency,
                            data.locale,
                          )}{" "}
                          · Due {date(m.invoice.dueOn)}
                        </small>
                      </dd>
                    </div>
                    <div>
                      <dt>Branch access</dt>
                      <dd>
                        {m.snapshot.accessMode === "all_branches"
                          ? "All gym branches"
                          : "Member home branch"}
                      </dd>
                    </div>
                  </dl>
                  {m.cancelledEffectiveOn ? (
                    <p className="support">
                      Cancellation effective {date(m.cancelledEffectiveOn)}. The
                      invoice amount is unchanged.
                    </p>
                  ) : null}
                  <div className="membership-actions">
                    {data.canOverride &&
                    !data.archived &&
                    m.lifecycle === "pending" &&
                    m.endOn > data.today ? (
                      <button
                        className="text-action"
                        disabled={locked}
                        onClick={() =>
                          open({
                            kind: "activate",
                            membership: m,
                            key: crypto.randomUUID(),
                          })
                        }
                      >
                        {m.amountMinor > 0
                          ? "Activate with debt"
                          : "Activate membership"}
                      </button>
                    ) : null}
                    {data.canOverride &&
                    !data.archived &&
                    m.lifecycle === "active" &&
                    m.endOn > data.today ? (
                      <button
                        className="text-action"
                        disabled={locked}
                        onClick={() =>
                          open({
                            kind: "freeze",
                            membership: m,
                            key: crypto.randomUUID(),
                          })
                        }
                      >
                        Freeze membership
                      </button>
                    ) : null}
                    {data.canOverride &&
                    !m.cancelledEffectiveOn &&
                    m.endOn > data.today ? (
                      <button
                        className="text-action"
                        disabled={locked}
                        onClick={() =>
                          open({
                            kind: "cancel",
                            membership: m,
                            key: crypto.randomUUID(),
                          })
                        }
                      >
                        Cancel membership
                      </button>
                    ) : null}
                  </div>
                  {m.freezes.length ? (
                    <ul className="membership-freezes">
                      {m.freezes.map((f) => (
                        <li key={f.id}>
                          <div>
                            <strong>
                              {f.reversedAt ? "Reversed freeze" : "Freeze"}:{" "}
                              {date(f.startOn)} — {date(previousDay(f.endOn))}
                            </strong>
                            <p>
                              {f.extensionDays} extension days · {f.reason}
                            </p>
                          </div>
                          {!f.reversedAt &&
                          data.canOverride &&
                          !data.archived ? (
                            <button
                              className="text-action"
                              disabled={locked || f.startOn < data.today}
                              title={
                                f.startOn < data.today
                                  ? "A past freeze cannot be reversed"
                                  : undefined
                              }
                              onClick={() =>
                                open({
                                  kind: "reverse_freeze",
                                  membership: m,
                                  freeze: f,
                                  key: crypto.randomUUID(),
                                })
                              }
                            >
                              Reverse freeze
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="empty">
              No memberships recorded in your permitted branch scope.
            </p>
          )}
          <div className="member-pagination">
            <span>
              {data.total} memberships · Page {data.page} of{" "}
              {Math.max(1, Math.ceil(data.total / 20))}
            </span>
            <div>
              <button
                disabled={locked || data.page === 1}
                onClick={() => reload(data.page - 1)}
              >
                Previous memberships
              </button>
              <button
                disabled={locked || data.page * 20 >= data.total}
                onClick={() => reload(data.page + 1)}
              >
                Next memberships
              </button>
            </div>
          </div>
        </>
      ) : null}
      <p className="support">
        Invoices record charges. Open an issued invoice to record funds received
        and view its paid receipts. Full settlement activates eligible pending
        memberships.
      </p>
      {editor ? (
        <Drawer
          title={
            editor.kind === "enroll"
              ? "Enroll member"
              : editor.kind === "renew"
                ? "Renew membership"
                : editor.kind === "activate"
                  ? "Activate membership"
                  : editor.kind === "freeze"
                    ? "Freeze membership"
                    : editor.kind === "cancel"
                      ? "Cancel membership"
                      : "Reverse freeze"
          }
          busy={busy}
          onClose={() => {
            setEditor(null);
            setError("");
          }}
        >
          {editor.kind === "enroll" || editor.kind === "renew" ? (
            <EnrollmentForm
              key={editor.key}
              data={data}
              mode={editor.kind}
              busy={busy}
              error={error}
              onSave={(v) => save(v, true)}
              onFindPlans={async (query) => {
                const r = await fetch(
                    base +
                      `?organizationId=${data.organizationId}&planQuery=${encodeURIComponent(query)}`,
                    { cache: "no-store" },
                  ),
                  j = await r.json();
                if (!r.ok)
                  throw new Error(
                    j.error?.message ?? "Could not search plans.",
                  );
                return j.data;
              }}
              onPreview={async (body) => {
                const r = await fetch(base + "/preview", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      organizationId: data.organizationId,
                      memberVersion: data.memberVersion,
                      ...body,
                    }),
                  }),
                  j = await r.json();
                if (!r.ok)
                  throw new Error(
                    j.error?.message ?? "Could not preview this membership.",
                  );
                return j.data;
              }}
            />
          ) : (
            <LifecycleForm
              key={editor.key}
              editor={editor as Exclude<Editor, { kind: "enroll" | "renew" }>}
              data={data}
              busy={busy}
              error={error}
              onSave={(v) => save(v, false)}
            />
          )}
        </Drawer>
      ) : null}
    </section>
  );
}
function EnrollmentForm({
  data,
  mode,
  busy,
  error,
  onPreview,
  onFindPlans,
  onSave,
}: {
  data: MembershipContext;
  mode: "enroll" | "renew";
  busy: boolean;
  error: string;
  onPreview: (v: Record<string, unknown>) => Promise<EnrollmentPreview>;
  onFindPlans: (
    query: string,
  ) => Promise<Pick<MembershipContext, "plans" | "planCount">>;
  onSave: (v: Record<string, unknown>) => void;
}) {
  const [planVersionId, setPlan] = useState(
      data.plans.find((p) => p.planId === data.monthlyFee?.planId)?.id ??
        data.plans[0]?.id ??
        "",
    ),
    [startOn, setStart] = useState(
      mode === "renew" ? data.nextStartOn : data.today,
    ),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState<EnrollmentPreview | null>(null),
    [checking, setChecking] = useState(false),
    [localError, setError] = useState("");
  const [setMonthlyFee, setSetMonthlyFee] = useState(false),
    [feeAmount, setFeeAmount] = useState(
      data.monthlyFee
        ? amountInput(
            Number(data.monthlyFee.amountMinor),
            data.monthlyFee.currency,
          )
        : "",
    ),
    [feeReminderDays, setFeeReminderDays] = useState(
      data.monthlyFee?.reminderDays ?? 7,
    );
  const [useCatalogPrice, setUseCatalogPrice] = useState(false);
  const payload = {
    mode,
    planVersionId,
    startOn,
    ...(useCatalogPrice ? { useCatalogPrice: true } : {}),
  };
  const [planQuery, setPlanQuery] = useState(""),
    [choices, setChoices] = useState(data.plans),
    [planCount, setPlanCount] = useState(data.planCount);
  return (
    <form
      className="membership-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setChecking(true);
        try {
          const submitted = {
            ...payload,
            ...(setMonthlyFee
              ? {
                  monthlyFee: {
                    amountMinor: String(parseAmount(feeAmount, data.currency)),
                    reminderDays: feeReminderDays,
                  },
                }
              : {}),
          };
          if (preview) {
            onSave({ ...submitted, reason });
            return;
          }
          setPreview(await onPreview(submitted));
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not preview.");
        } finally {
          setChecking(false);
        }
      }}
    >
      <fieldset disabled={busy || checking}>
        <label>
          Find plan
          <input
            maxLength={100}
            placeholder="Plan name or code"
            value={planQuery}
            onChange={(e) => setPlanQuery(e.target.value)}
          />
        </label>
        <button
          className="button secondary"
          type="button"
          onClick={async () => {
            setChecking(true);
            setError("");
            try {
              const r = await onFindPlans(planQuery);
              setChoices(r.plans);
              setPlanCount(r.planCount);
              setPlan(r.plans[0]?.id ?? "");
              setPreview(null);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not search plans.",
              );
            } finally {
              setChecking(false);
            }
          }}
        >
          Search plans
        </button>
        <label>
          Membership plan
          <select
            aria-label="Membership plan"
            required
            value={planVersionId}
            onChange={(e) => {
              setPlan(e.target.value);
              setPreview(null);
            }}
          >
            {choices.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name} — {money(p.amountMinor, p.currency, data.locale)} /{" "}
                {term(p.durationCount, p.durationUnit)}
              </option>
            ))}
          </select>
        </label>
        {planCount === 0 ? (
          <p className="support">
            No matching active plans. Try another name or code.
          </p>
        ) : null}
        {planCount > choices.length ? (
          <p className="support">
            Showing the first {choices.length} of {planCount} matching plans.
            Narrow the search to find another plan.
          </p>
        ) : null}
        <label>
          Start date
          <input
            type="date"
            required
            min={data.today}
            value={startOn}
            onChange={(e) => {
              setStart(e.target.value);
              setPreview(null);
            }}
          />
        </label>
        {data.canSetMonthlyFee ? (
          <section className="membership-review">
            <label>
              <input
                type="checkbox"
                checked={setMonthlyFee}
                onChange={(e) => {
                  setSetMonthlyFee(e.target.checked);
                  setUseCatalogPrice(false);
                  setPreview(null);
                }}
              />{" "}
              Set or change this member’s monthly fee
            </label>
            {data.monthlyFee ? (
              <label>
                <input
                  type="checkbox"
                  checked={useCatalogPrice}
                  onChange={(e) => {
                    setUseCatalogPrice(e.target.checked);
                    setSetMonthlyFee(false);
                    setPreview(null);
                  }}
                />{" "}
                Use catalog price and end the monthly fee agreement
              </label>
            ) : null}
            {setMonthlyFee ? (
              <>
                <label>
                  Agreed monthly fee ({data.currency})
                  <input
                    required
                    inputMode="decimal"
                    value={feeAmount}
                    onChange={(e) => {
                      setFeeAmount(e.target.value);
                      setPreview(null);
                    }}
                  />
                </label>
                <label>
                  Reminder days before due
                  <input
                    required
                    type="number"
                    min={1}
                    max={30}
                    value={feeReminderDays}
                    onChange={(e) => {
                      setFeeReminderDays(Number(e.target.value));
                      setPreview(null);
                    }}
                  />
                </label>
                <p>
                  Requires a one-month plan. Applies to this new term and
                  subsequent renewals, preserving earlier invoices and fee
                  history.
                </p>
              </>
            ) : data.monthlyFee && !useCatalogPrice ? (
              <p>
                The saved member fee is used for renewal, regardless of the
                catalog price shown above.
              </p>
            ) : null}
          </section>
        ) : null}
        <label>
          Reason
          <textarea
            required
            minLength={3}
            maxLength={300}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setPreview(null);
            }}
          />
        </label>
      </fieldset>
      {preview ? (
        <section className="membership-review" aria-label="Enrollment review">
          <h3>Review before confirming</h3>
          <p>
            <strong>{preview.plan.name}</strong> · Version{" "}
            {preview.plan.planVersion}
          </p>
          <p>
            Charge:{" "}
            <strong>
              {money(
                preview.plan.amountMinor,
                preview.plan.currency,
                data.locale,
              )}
            </strong>
          </p>
          <p>
            Access dates: {preview.startOn} through {preview.lastAccessOn}
            <br />
            Exclusive end: {preview.endOn}
          </p>
          <p>
            Initial state:{" "}
            {preview.activation === "pending" ? "Pending activation" : "Active"}
          </p>
          <p>{preview.reason}</p>
          <p>
            Confirming creates one membership and its issued invoice. It does
            not record payment.
          </p>
        </section>
      ) : null}
      {localError || error ? (
        <p role="alert" className="settings-error">
          {localError || error}
        </p>
      ) : null}
      <button className="button primary" disabled={busy || checking}>
        {busy
          ? "Saving…"
          : checking
            ? "Checking…"
            : preview
              ? mode === "renew"
                ? "Confirm renewal"
                : "Confirm enrollment"
              : "Review membership"}
      </button>
    </form>
  );
}
function LifecycleForm({
  editor,
  data,
  busy,
  error,
  onSave,
}: {
  editor: {
    kind: "activate" | "freeze" | "reverse_freeze" | "cancel";
    key: string;
    membership: Membership;
    freeze?: Freeze;
  };
  data: MembershipContext;
  busy: boolean;
  error: string;
  onSave: (v: Record<string, unknown>) => void;
}) {
  const m = editor.membership,
    [from, setFrom] = useState(m.startOn > data.today ? m.startOn : data.today),
    [until, setUntil] = useState(
      endOn(m.startOn > data.today ? m.startOn : data.today, 1, "days"),
    );
  let extended = "";
  try {
    const days = daysBetween(from, until);
    if (days > 0) extended = endOn(m.endOn, days, "days");
  } catch {}
  return (
    <form
      className="membership-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave({
          operation: editor.kind,
          membershipId: m.id,
          version: m.version,
          reason: f.get("reason"),
          ...(editor.kind === "freeze" ? { startOn: from, endOn: until } : {}),
          ...(editor.kind === "cancel"
            ? { effectiveOn: f.get("effectiveOn") }
            : {}),
          ...(editor.kind === "reverse_freeze"
            ? { freezeId: editor.freeze!.id }
            : {}),
        });
      }}
    >
      <fieldset disabled={busy}>
        {editor.kind === "activate" ? (
          <p>
            Activation with debt does not record payment or clear invoice{" "}
            {m.invoice.number}. The gym’s separate debt-blocking policy can
            still deny access.
          </p>
        ) : editor.kind === "cancel" ? (
          <>
            <p>
              Access stops at the start of the effective date. The issued
              invoice stays unchanged; no refund or credit is created.
            </p>
            <label>
              Effective date
              <input
                type="date"
                name="effectiveOn"
                min={data.today}
                max={m.endOn}
                defaultValue={data.today}
                required
              />
            </label>
          </>
        ) : editor.kind === "freeze" ? (
          <>
            <p>
              A prospective freeze blocks access during its dates and extends
              the membership once. A collision with a future renewal will be
              rejected.
            </p>
            <label>
              Freeze from
              <input
                type="date"
                value={from}
                min={data.today}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </label>
            <label>
              Resume on (exclusive)
              <input
                type="date"
                value={until}
                max={m.endOn}
                onChange={(e) => setUntil(e.target.value)}
                required
              />
            </label>
            {extended ? (
              <p className="membership-review">
                Extension: {daysBetween(from, until)} days. New exclusive end:{" "}
                {extended}.
              </p>
            ) : null}
          </>
        ) : (
          <p>
            Reverse the selected freeze and remove its{" "}
            {editor.freeze?.extensionDays} extension days once. Its history
            remains retained.
          </p>
        )}
        <label>
          Reason
          <textarea name="reason" minLength={3} maxLength={300} required />
        </label>
      </fieldset>
      {error ? (
        <p role="alert" className="settings-error">
          {error}
        </p>
      ) : null}
      <button className="button primary" disabled={busy}>
        {busy
          ? "Saving…"
          : editor.kind === "activate"
            ? "Confirm activation"
            : editor.kind === "freeze"
              ? "Confirm freeze"
              : editor.kind === "cancel"
                ? "Confirm cancellation"
                : "Confirm reversal"}
      </button>
    </form>
  );
}
