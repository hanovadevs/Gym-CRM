"use client";
import { useState } from "react";
import { Drawer } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/section-title";
import { amountInput, parseAmount, money } from "@/modules/plans/format";
import { createMember, updateMember } from "./schemas";
import type { Directory, Member, DuplicateMatch } from "./types";
type SaveResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      duplicates?: DuplicateMatch[];
      moreMatches?: boolean;
    };
export function MemberEditor({
  data,
  record,
  onClose,
  onSave,
  busy,
}: {
  data: Pick<
    Directory,
    | "organization"
    | "branches"
    | "today"
    | "canSetMonthlyFee"
    | "monthlyPlans"
    | "monthlyPlanCount"
  > & {
    query?: { branchId?: string };
  };
  record?: Member;
  onClose: () => void;
  onSave: (body: unknown, editing: boolean) => Promise<SaveResult>;
  busy: boolean;
}) {
  const [registrationKey] = useState(() => crypto.randomUUID());
  const [values, setValues] = useState({
    name: record?.name ?? "",
    phone: record?.phone ?? "",
    email: record?.email ?? "",
    homeBranchId:
      record?.homeBranchId ?? data.query?.branchId ?? data.branches[0].id,
    joinedOn: record?.joinedOn ?? data.today,
  });
  const [includeFee, setIncludeFee] = useState(false),
    [feePlanId, setFeePlanId] = useState(""),
    [feeAmount, setFeeAmount] = useState(""),
    [feeStart, setFeeStart] = useState(data.today),
    [reminderDays, setReminderDays] = useState(7);
  const monthlyPlans = (data.monthlyPlans ?? []).filter(
    (p) => p.branchId === values.homeBranchId,
  );
  const feePlan = monthlyPlans.find((p) => p.id === feePlanId);
  const [step, setStep] = useState("details"),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]),
    [ack, setAck] = useState(false),
    [duplicateReason, setDuplicateReason] = useState(""),
    [more, setMore] = useState(false);
  function change(key: keyof typeof values, value: string) {
    setValues({ ...values, [key]: value });
    if (key === "homeBranchId") {
      setFeePlanId("");
      setFeeAmount("");
    }
    setDuplicates([]);
    setAck(false);
    setDuplicateReason("");
    setError("");
  }
  return (
    <Drawer
      title={record ? "Edit member" : "Add member"}
      onClose={onClose}
      busy={busy}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          let monthlyFee;
          if (!record && includeFee) {
            try {
              if (!feePlan)
                throw Error("Choose an active one-month plan for this branch.");
              monthlyFee = {
                planVersionId: feePlan.id,
                amountMinor: String(parseAmount(feeAmount, feePlan.currency)),
                startOn: feeStart,
                reminderDays,
              };
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Check the monthly fee.",
              );
              return;
            }
          }
          const body = {
            ...values,
            organizationId: data.organization.id,
            acknowledgeDuplicate: ack,
            duplicateReason,
            ...(record
              ? { id: record.id, version: record.version, reason }
              : { registrationKey, ...(monthlyFee ? { monthlyFee } : {}) }),
          };
          const parsed = (record ? updateMember : createMember).safeParse(body);
          if (!parsed.success) {
            setError(
              parsed.error.issues
                .slice(0, 3)
                .map((i) => i.message)
                .join("; "),
            );
            return;
          }
          if (!record && step === "details") {
            setStep("review");
            return;
          }
          const result = await onSave(parsed.data, Boolean(record));
          if (!result.ok) {
            setError(result.message);
            setDuplicates(result.duplicates ?? []);
            setMore(result.moreMatches ?? false);
          }
        }}
      >
        <fieldset disabled={busy} className="drawer-fields member-editor">
          {step === "details" ? (
            <>
              <SectionTitle
                title="Registration details"
                help="A name, usable phone or email, home branch and joining date are required. Registration does not create a login or grant gym access. Shared family contacts are allowed after review."
              />
              <label className="field">
                Full name
                <input
                  name="name"
                  required
                  maxLength={100}
                  value={values.name}
                  onChange={(e) => change("name", e.target.value)}
                  autoComplete="name"
                />
              </label>
              <label className="field">
                Phone
                <input
                  name="phone"
                  type="tel"
                  maxLength={40}
                  value={values.phone}
                  onChange={(e) => change("phone", e.target.value)}
                  autoComplete="tel"
                />
              </label>
              <label className="field">
                Email
                <input
                  name="email"
                  type="email"
                  maxLength={254}
                  value={values.email}
                  onChange={(e) => change("email", e.target.value)}
                  autoComplete="email"
                />
              </label>
              <p className="support">
                Provide at least one usable contact method.
              </p>
              {data.branches.length > 1 ? (
                <label className="field">
                  Home branch
                  <select
                    aria-label="Home branch"
                    name="homeBranchId"
                    value={values.homeBranchId}
                    onChange={(e) => change("homeBranchId", e.target.value)}
                  >
                    {data.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="support">Home branch: {data.branches[0].name}</p>
              )}
              <label className="field">
                Joining date
                <input
                  name="joinedOn"
                  type="date"
                  required
                  min="1900-01-01"
                  max={data.today}
                  value={values.joinedOn}
                  onChange={(e) => change("joinedOn", e.target.value)}
                />
              </label>
              {!record && data.canSetMonthlyFee ? (
                <section className="member-monthly-fee">
                  <SectionTitle
                    title="Monthly subscription"
                    help="Set this member’s agreed fee using a one-month plan for access benefits. Saving creates the first membership and issued invoice together. Future renewals retain the agreed rate; payments are recorded separately."
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={includeFee}
                      onChange={(e) => setIncludeFee(e.target.checked)}
                    />{" "}
                    Add monthly subscription
                  </label>
                  {includeFee ? (
                    <>
                      <label className="field">
                        Monthly access plan
                        <select
                          required
                          aria-label="Monthly access plan"
                          value={feePlanId}
                          onChange={(e) => {
                            setFeePlanId(e.target.value);
                            const p = monthlyPlans.find(
                              (p) => p.id === e.target.value,
                            );
                            setFeeAmount(
                              p ? amountInput(p.amountMinor, p.currency) : "",
                            );
                          }}
                        >
                          <option value="">Choose a monthly plan</option>
                          {monthlyPlans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.currency})
                            </option>
                          ))}
                        </select>
                      </label>
                      {!monthlyPlans.length ? (
                        <p className="support">
                          Create an active one-month plan for this branch in
                          Plans first.
                        </p>
                      ) : null}
                      {(data.monthlyPlanCount ?? 0) > 200 ? (
                        <p className="support">
                          Showing the first 200 monthly plans. Narrow the
                          catalog before registering if your plan is missing.
                        </p>
                      ) : null}
                      <label className="field">
                        Member monthly fee
                        {feePlan ? " (" + feePlan.currency + ")" : ""}
                        <input
                          required
                          inputMode="decimal"
                          value={feeAmount}
                          onChange={(e) => setFeeAmount(e.target.value)}
                        />
                      </label>
                      <label className="field">
                        Subscription start date
                        <input
                          required
                          type="date"
                          min={data.today}
                          value={feeStart}
                          onChange={(e) => setFeeStart(e.target.value)}
                        />
                      </label>
                      <label className="field">
                        Remind before due date (days)
                        <input
                          required
                          type="number"
                          min={1}
                          max={30}
                          value={reminderDays}
                          onChange={(e) =>
                            setReminderDays(Number(e.target.value))
                          }
                        />
                      </label>
                      <p className="support">
                        Owner reminders appear inside Mojym and in the owner’s
                        email summary. No payment is recorded by registration.
                      </p>
                    </>
                  ) : null}
                </section>
              ) : null}
              {record ? (
                <label className="field">
                  Reason for change
                  <input
                    required
                    minLength={3}
                    maxLength={300}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              ) : null}
            </>
          ) : (
            <>
              <SectionTitle
                title="Review registration"
                help="Review contact details and any agreed monthly subscription before saving. Payment is always a separate confirmed action."
              />
              <dl className="registration-summary">
                <dt>Name</dt>
                <dd>{values.name}</dd>
                <dt>Phone</dt>
                <dd>{values.phone || "Not provided"}</dd>
                <dt>Email</dt>
                <dd>{values.email || "Not provided"}</dd>
                <dt>Home branch</dt>
                <dd>
                  {
                    data.branches.find((b) => b.id === values.homeBranchId)
                      ?.name
                  }
                </dd>
                <dt>Joined</dt>
                <dd>{values.joinedOn}</dd>
              </dl>
              {includeFee && feePlan ? (
                <section className="registration-note">
                  <strong>
                    Monthly subscription:{" "}
                    {money(
                      parseAmount(feeAmount, feePlan.currency),
                      feePlan.currency,
                      data.organization.locale,
                    )}
                  </strong>
                  <p>
                    {feePlan.name}; starts {feeStart}; reminders {reminderDays}{" "}
                    days before due.
                  </p>
                  <p>
                    Creates the member, agreed fee, first monthly membership and
                    issued invoice together. No payment is recorded.
                  </p>
                </section>
              ) : (
                <p className="registration-note">
                  Registration only. No membership, invoice or payment will be
                  created.
                </p>
              )}
            </>
          )}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {duplicates.length ? (
            <section
              className="duplicate-review"
              aria-label="Possible shared contacts"
            >
              <h3>Review possible matches</h3>
              <ul>
                {duplicates.map((m) => (
                  <li key={m.id}>
                    <strong>{m.name}</strong>
                    <span>
                      {m.memberCode} / {m.branchName}
                    </span>
                  </li>
                ))}
              </ul>
              {more ? (
                <p>
                  More matches exist. Check the directory before continuing.
                </p>
              ) : null}
              <label>
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />{" "}
                This is a different person using a shared contact
              </label>
              {ack ? (
                <label className="field">
                  Shared contact reason
                  <input
                    required
                    minLength={3}
                    maxLength={300}
                    value={duplicateReason}
                    onChange={(e) => setDuplicateReason(e.target.value)}
                  />
                </label>
              ) : null}
            </section>
          ) : null}
          <div className="member-editor-actions">
            {step === "review" ? (
              <button type="button" onClick={() => setStep("details")}>
                Back to details
              </button>
            ) : null}
            <button
              type="submit"
              className="primary"
              disabled={busy || (duplicates.length > 0 && !ack)}
            >
              {busy
                ? "Saving…"
                : record
                  ? "Save member"
                  : step === "details"
                    ? "Review registration"
                    : "Register member"}
            </button>
          </div>
        </fieldset>
      </form>
    </Drawer>
  );
}
