"use client";
import { useState } from "react";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { SectionTitle } from "@/components/ui/section-title";
import { Drawer } from "@/components/ui/primitives";
import { MemberEditor } from "./member-editor";
import { useHydrated } from "@/lib/use-hydrated";
import type { Profile } from "./profile-types";
import { MembershipsPanel } from "@/modules/memberships/memberships-panel";
import { eligibilityLabel } from "@/modules/memberships/state";
export function ProfileScreen({ initial }: { initial: Profile }) {
  const hydrated = useHydrated();
  const [data, setData] = useState(initial),
    [tab, setTab] = useState("Overview"),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [blocked, setBlocked] = useState(false),
    [editor, setEditor] = useState<{
      kind: "member" | "contact" | "archive" | "withdraw";
      noteId?: string;
    } | null>(null),
    [clearContact, setClearContact] = useState(false),
    [body, setBody] = useState(""),
    [visibility, setVisibility] = useState("operational"),
    [noteKey, setNoteKey] = useState(() => crypto.randomUUID());
  const base = `/api/members/${data.member.id}`;
  async function reload(page = data.notesPage) {
    const r = await fetch(
      base + `?organizationId=${data.organization.id}&notesPage=${page}`,
      { cache: "no-store" },
    );
    const result = await r.json();
    if (!r.ok)
      throw new Error(result.error?.message ?? "Could not reload profile.");
    setData(result.data);
    setBlocked(false);
  }
  async function submit(path: string, method: string, payload: unknown) {
    setPending(true);
    setError("");
    setMessage("");
    let committed = false;
    try {
      const r = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await r.json();
      if (!r.ok) {
        setError(result.error?.message ?? "Could not save.");
        return {
          ok: false as const,
          message: result.error?.message ?? "Could not save.",
          duplicates: result.error?.details?.duplicates,
          moreMatches: result.error?.details?.moreMatches,
        };
      }
      committed = true;
      setMessage("Changes saved.");
      setEditor(null);
      await reload();
      return { ok: true as const };
    } catch (e) {
      const text = committed
        ? "Changes were saved, but the profile could not refresh. Reload before editing again."
        : e instanceof TypeError
          ? "Could not reach the server. Your inputs are kept."
          : "Could not read the server response. Your inputs are kept.";
      setError(text);
      if (committed) {
        setBlocked(true);
        setEditor(null);
        return { ok: true as const };
      }
      return { ok: false as const, message: text };
    } finally {
      setPending(false);
    }
  }
  const locked = !hydrated || pending || blocked,
    archived = Boolean(data.member.archivedAt);
  const date = (value: string, instant = false) =>
    new Intl.DateTimeFormat(data.organization.locale, {
      dateStyle: "medium",
      ...(instant ? { timeStyle: "short" as const } : {}),
      timeZone: instant ? data.organization.timeZone : "UTC",
    }).format(new Date(instant ? value : value + "T12:00:00Z"));
  function open(kind: "member" | "contact" | "archive", noteId?: string) {
    setError("");
    setMessage("");
    setClearContact(false);
    setEditor({ kind, noteId });
  }
  return (
    <WorkspaceFrame
      organization={data.organization}
      canManageSettings={data.canManageSettings}
    >
      <a
        className="text-action profile-back"
        href={`/members?organizationId=${data.organization.id}`}
      >
        Members / Profile
      </a>
      <div className="profile-heading">
        <div className="profile-identity">
          <span className="profile-initials" aria-hidden="true">
            {data.member.name
              .split(/\s+/)
              .slice(0, 2)
              .map((s) => s[0])
              .join("")
              .toUpperCase()}
          </span>
          <div>
            <h1>{data.member.name}</h1>
            <p>Member ID: {data.member.memberCode}</p>
            <span className="profile-state">
              {blocked
                ? "Reload required"
                : archived
                  ? "Archived"
                  : "Registered"}
            </span>
          </div>
        </div>
        <div className="profile-actions">
          <a className="button secondary" href={`/payments?organizationId=${data.organization.id}&memberId=${data.member.id}`}>Invoices &amp; balances</a>
          <button disabled={locked || archived} onClick={() => open("member")}>
            Edit member
          </button>
          {data.canManage ? (
            <button disabled={locked} onClick={() => open("archive")}>
              {archived ? "Restore member" : "Archive member"}
            </button>
          ) : null}
        </div>
      </div>
      {error && !editor ? (
        <div className="form-error" role="alert">
          {error}
          {!editor ? (
            <button
              disabled={pending}
              onClick={() => {
                setPending(true);
                reload()
                  .then(() => setError(""))
                  .catch((e) => {
                    setError(e.message);
                    setBlocked(true);
                  })
                  .finally(() => setPending(false));
              }}
            >
              Reload profile
            </button>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
      {!blocked ? (
        <>
          <div
            className="settings-tabs profile-tabs"
            role="tablist"
            aria-label="Member profile sections"
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              const buttons = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                ),
              );
              const i = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? buttons.length - 1
                    : (i + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                      buttons.length;
              buttons[next].click();
              buttons[next].focus();
            }}
          >
            {["Overview", "Memberships", "Notes", "History"].map((t) => (
              <button
                id={"profile-tab-" + t}
                aria-controls="profile-panel"
                type="button"
                role="tab"
                key={t}
                tabIndex={tab === t ? 0 : -1}
                aria-selected={tab === t}
                disabled={pending}
                onClick={() => {
                  setTab(t);
                  setError("");
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div
            id="profile-panel"
            role="tabpanel"
            aria-labelledby={"profile-tab-" + tab}
          >
            {tab === "Overview" ? (
              <div className="profile-overview">
                <section className="panel">
                  <SectionTitle
                    title="Registration"
                    help="Registration is separate from an active membership. Archiving keeps history and blocks changes, enrollment and gym access."
                  />
                  <dl className="profile-details">
                    <dt>Home branch</dt>
                    <dd>{data.member.branchName}</dd>
                    <dt>Joined</dt>
                    <dd>{date(data.member.joinedOn)}</dd>
                    <dt>Access</dt>
                    <dd>{eligibilityLabel(data.eligibility)}</dd>
                  </dl>
                  <p className="support">
                    Membership history is connected below. Attendance and
                    payments will appear when those services are connected.
                  </p>
                </section>
                <section className="panel">
                  <SectionTitle
                    title="Personal details"
                    help="Contact information is restricted to staff with member-management access in this member's branch."
                  />
                  <dl className="profile-details">
                    <dt>Phone</dt>
                    <dd>{data.member.phone || "Not provided"}</dd>
                    <dt>Email</dt>
                    <dd>{data.member.email || "Not provided"}</dd>
                  </dl>
                </section>
                <section className="panel">
                  <SectionTitle
                    title="Emergency contact"
                    help="Store a name, phone and optional relationship. Do not put medical information in this contact record."
                  />
                  {data.contact ? (
                    <dl className="profile-details">
                      <dt>Name</dt>
                      <dd>{data.contact.name}</dd>
                      <dt>Phone</dt>
                      <dd>{data.contact.phone}</dd>
                      <dt>Relationship</dt>
                      <dd>{data.contact.relationship || "Not specified"}</dd>
                    </dl>
                  ) : (
                    <p className="empty">No emergency contact recorded.</p>
                  )}
                  <button
                    disabled={locked || archived}
                    onClick={() => open("contact")}
                  >
                    {data.contact
                      ? "Edit emergency contact"
                      : "Add emergency contact"}
                  </button>
                </section>
              </div>
            ) : null}
            {tab === "Overview" || tab === "Memberships" ? (
              <MembershipsPanel
                key={data.member.version}
                initial={data.memberships}
                onChanged={async () => {
                  await reload();
                  setMessage("Membership changes saved.");
                }}
                onBlock={() => {
                  setBlocked(true);
                  setError(
                    "Membership changes were saved, but the profile could not refresh. Reload before editing again.",
                  );
                }}
              />
            ) : null}
            {tab === "Overview" || tab === "Notes" ? (
              <section className="panel profile-notes">
                <SectionTitle
                  title="Member notes"
                  help="Operational notes are visible to permitted branch staff. Management notes are limited to owners/managers. Avoid medical or other sensitive details without an agreed consent policy. Withdrawal retains the original record but hides its body."
                />
                {archived ? (
                  <p className="registration-note">
                    This member is archived. New notes and profile changes are
                    blocked.
                  </p>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const result = await submit(base + "/notes", "POST", {
                        organizationId: data.organization.id,
                        requestKey: noteKey,
                        body,
                        visibility,
                      });
                      if (result.ok) {
                        setBody("");
                        setNoteKey(crypto.randomUUID());
                      }
                    }}
                  >
                    <label className="field">
                      New operational note
                      <textarea
                        required
                        maxLength={2000}
                        rows={3}
                        value={body}
                        disabled={locked}
                        onChange={(e) => setBody(e.target.value)}
                      />
                    </label>
                    {data.canManage ? (
                      <label className="field">
                        Note visibility
                        <select
                          aria-label="Note visibility"
                          value={visibility}
                          disabled={locked}
                          onChange={(e) => setVisibility(e.target.value)}
                        >
                          <option value="operational">
                            Operational: permitted branch staff
                          </option>
                          <option value="management">
                            Management: owner and managers
                          </option>
                        </select>
                      </label>
                    ) : null}
                    <button className="primary" disabled={locked} type="submit">
                      {pending ? "Saving…" : "Add note"}
                    </button>
                  </form>
                )}
                {data.notes.length ? (
                  <ol className="profile-note-list">
                    {data.notes.map((n) => (
                      <li key={n.id}>
                        <div className="profile-note-heading">
                          <strong>
                            {n.visibility === "management"
                              ? "Management note"
                              : "Operational note"}
                          </strong>
                          <span>By {n.authorName}</span>
                          <time dateTime={n.createdAt}>
                            {date(n.createdAt, true)}
                          </time>
                        </div>
                        {n.withdrawn ? (
                          <p className="support">
                            Withdrawn: {n.withdrawalReason}
                          </p>
                        ) : (
                          <p className="note-body">{n.body}</p>
                        )}
                        {n.canWithdraw ? (
                          <button
                            disabled={locked}
                            onClick={() => {
                              setError("");
                              setEditor({ kind: "withdraw", noteId: n.id });
                            }}
                          >
                            Withdraw note by {n.authorName}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="empty">No notes visible in your scope.</p>
                )}
                <div className="member-pagination">
                  <span>
                    {data.notesTotal} visible notes / Page {data.notesPage} of{" "}
                    {Math.max(1, Math.ceil(data.notesTotal / 20))}
                  </span>
                  <div>
                    {["Previous", "Next"].map((s, i) => (
                      <button
                        key={s}
                        disabled={
                          locked ||
                          (i === 0
                            ? data.notesPage <= 1
                            : data.notesPage * 20 >= data.notesTotal)
                        }
                        onClick={() => {
                          setPending(true);
                          reload(data.notesPage + (i === 0 ? -1 : 1))
                            .catch((e) => {
                              setError(e.message);
                              setBlocked(true);
                            })
                            .finally(() => setPending(false));
                        }}
                      >
                        {s} notes
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}
            {tab === "History" ? (
              <section className="panel">
                <SectionTitle
                  title="Profile history"
                  help="The latest 20 permitted profile changes are shown. Owners and managers see branch-scoped history; reception sees its own actions. Note content and private management activity are not exposed here."
                />
                {data.history.length ? (
                  <ol className="audit-list">
                    {data.history.map((event) => (
                      <li key={event.id}>
                        <strong>
                          {
                            (
                              {
                                "member.registered": "Member registered",
                                "member.updated": "Member details updated",
                                "member.emergency_contact_updated":
                                  "Emergency contact updated",
                                "member.archived": "Member archived",
                                "member.restored": "Member restored",
                              } as Record<string, string>
                            )[event.action]
                          }
                        </strong>
                        <p>{event.reason}</p>
                        <p className="support">By {event.actorName}</p>
                        <time dateTime={event.occurredAt}>
                          {date(event.occurredAt, true)}
                        </time>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="empty">
                    No profile changes visible in your scope.
                  </p>
                )}
              </section>
            ) : null}
          </div>
        </>
      ) : null}
      {editor?.kind === "member" ? (
        <MemberEditor
          data={data}
          record={data.member}
          busy={pending}
          onClose={() => {
            if (!pending) setEditor(null);
          }}
          onSave={(payload) => submit("/api/members", "PATCH", payload)}
        />
      ) : null}
      {editor && editor.kind !== "member" ? (
        <Drawer
          busy={pending}
          title={
            editor.kind === "contact"
              ? "Emergency contact"
              : editor.kind === "archive"
                ? archived
                  ? "Restore member"
                  : "Archive member"
                : "Withdraw note"
          }
          onClose={() => {
            if (!pending) setEditor(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                common = {
                  organizationId: data.organization.id,
                  reason: String(f.get("reason")),
                };
              if (editor.kind === "contact")
                await submit(base + "/contact", "PATCH", {
                  ...common,
                  version: data.member.version,
                  contact: clearContact
                    ? null
                    : {
                        name: String(f.get("name")),
                        phone: String(f.get("phone")),
                        relationship: String(f.get("relationship")),
                      },
                });
              else if (editor.kind === "archive")
                await submit(base + "/archive", "POST", {
                  ...common,
                  version: data.member.version,
                  archived: !archived,
                });
              else
                await submit(base + "/notes", "PATCH", {
                  ...common,
                  noteId: editor.noteId,
                });
            }}
          >
            <fieldset className="drawer-fields" disabled={pending}>
              {editor.kind === "contact" ? (
                <>
                  {data.contact ? (
                    <label className="field">
                      <span>
                        <input
                          type="checkbox"
                          checked={clearContact}
                          onChange={(e) => setClearContact(e.target.checked)}
                        />{" "}
                        Remove emergency contact
                      </span>
                    </label>
                  ) : null}
                  <label className="field">
                    Contact name
                    <input
                      name="name"
                      maxLength={100}
                      required={!clearContact}
                      disabled={clearContact}
                      defaultValue={data.contact?.name}
                    />
                  </label>
                  <label className="field">
                    Contact phone
                    <input
                      name="phone"
                      type="tel"
                      maxLength={40}
                      required={!clearContact}
                      disabled={clearContact}
                      defaultValue={data.contact?.phone}
                    />
                  </label>
                  <label className="field">
                    Relationship
                    <input
                      name="relationship"
                      maxLength={80}
                      disabled={clearContact}
                      defaultValue={data.contact?.relationship}
                    />
                  </label>
                </>
              ) : (
                <p className="registration-note">
                  {editor.kind === "archive"
                    ? archived
                      ? "Restoring enables profile changes. It does not enroll this member or take a payment."
                      : "Archiving preserves history, removes this member from registered lists and blocks profile changes and new notes."
                    : "The note body will be hidden, with the original retained. This cannot be undone through the app."}
                </p>
              )}
              <label className="field">
                Reason for change
                <input name="reason" required minLength={3} maxLength={300} />
              </label>
              {editor.kind === "archive" ? (
                <label className="archive-confirm">
                  <input type="checkbox" required /> Confirm{" "}
                  {archived ? "restore" : "archive"}
                </label>
              ) : null}
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button className="primary" disabled={pending} type="submit">
                {pending ? "Saving…" : "Save changes"}
              </button>
            </fieldset>
          </form>
        </Drawer>
      ) : null}
    </WorkspaceFrame>
  );
}
