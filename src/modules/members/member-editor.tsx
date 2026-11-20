"use client";
import { useState } from "react";
import { Drawer } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/section-title";
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
  data: Directory;
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
      record?.homeBranchId ?? data.query.branchId ?? data.branches[0].id,
    joinedOn: record?.joinedOn ?? data.today,
  });
  const [step, setStep] = useState("details"),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]),
    [ack, setAck] = useState(false),
    [duplicateReason, setDuplicateReason] = useState(""),
    [more, setMore] = useState(false);
  function change(key: keyof typeof values, value: string) {
    setValues({ ...values, [key]: value });
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
          const body = {
            ...values,
            organizationId: data.organization.id,
            acknowledgeDuplicate: ack,
            duplicateReason,
            ...(record
              ? { id: record.id, version: record.version, reason }
              : { registrationKey }),
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
                help="Saving registers this person once and assigns a member code. Membership enrollment and payment are separate steps, available when those modules are connected."
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
              <p className="registration-note">
                Registration only. No membership, invoice or payment will be
                created.
              </p>
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
