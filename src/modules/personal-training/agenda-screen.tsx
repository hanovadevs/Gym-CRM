"use client";
import Form from "next/form";
import Link from "next/link";
import { useState, useEffect } from "react";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { SectionTitle } from "@/components/ui/section-title";
import { Drawer } from "@/components/ui/primitives";
import { ResponsiveTable } from "@/components/responsive-tables";
import { localInput, offset } from "@/lib/schedule-clock";
import { shiftDate } from "@/modules/classes/calendar";
import { ptMutation } from "./schemas";
import type { Agenda, Assignment, PersonalSession } from "./types";
type Action =
  | { kind: "assignment"; assignment?: Assignment }
  | { kind: "session"; assignment: Assignment; session?: PersonalSession }
  | { kind: "cancel"; session: PersonalSession };
export function AgendaScreen({ initial }: { initial: Agenda }) {
  const [data, setData] = useState(initial),
    [editor, setEditor] = useState<Action | null>(null),
    [blocked, setBlocked] = useState(false),
    [error, setError] = useState("");
  const coach = data.trainers.find((t) => t.id === data.trainerId),
    scope = "?organizationId=" + data.organization.id;
  const href = (fields: Record<string, string>) =>
    "/training?" +
    new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(data.query)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      ),
      ...fields,
    });
  const time = (v: string) =>
    new Intl.DateTimeFormat(data.organization.locale, {
      timeZone: data.organization.timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(v));
  async function reload() {
    const r = await fetch(href({}).replace("/training?", "/api/training?"), {
        cache: "no-store",
      }),
      j = await r.json();
    if (!r.ok) throw Error(j.error?.message ?? "Could not refresh training.");
    setData(j.data);
    setBlocked(false);
    setError("");
  }
  return (
    <WorkspaceFrame
      organization={data.organization}
      active="trainers"
      canManageSettings={data.canManageSettings}
      canManageMembers={data.canManageMembers}
      canReadPlans={data.canReadPlans}
      canReadBilling={data.canReadBilling}
    >
      <div className="page-heading">
        <div>
          <h1>Personal training</h1>
          <p>
            Assigned members, effective dates and a conflict-safe coaching
            agenda.
          </p>
        </div>
        {data.canManage ? (
          <button
            className="button primary"
            disabled={blocked || !coach?.active || !coach.branchIds.length}
            onClick={() => setEditor({ kind: "assignment" })}
          >
            Assign member
          </button>
        ) : null}
      </div>
      <section className="panel pt-controls">
        <SectionTitle
          title={data.own ? "Your coaching agenda" : "Coaching agenda"}
          help="Assignments do not grant access. Personal sessions require an eligible PT membership for the entire session, an effective assignment and saved trainer availability. Trainer, room and member conflicts are checked when saving."
        />
        <Form action="/training" className="class-filters">
          <input
            type="hidden"
            name="organizationId"
            value={data.organization.id}
          />
          <label>
            Trainer
            <select
              name="trainerId"
              aria-label="Trainer"
              defaultValue={data.trainerId ?? ""}
            >
              {data.trainers.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                  {t.active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Branch
            <select
              name="branchId"
              aria-label="Branch"
              defaultValue={data.query.branchId ?? ""}
            >
              <option value="">All authorized branches</option>
              {data.branches.map((b) => (
                <option value={b.id} key={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            From date
            <input type="date" name="from" required defaultValue={data.from} />
          </label>
          <label>
            Through date
            <input type="date" name="to" required defaultValue={data.to} />
          </label>
          <label>
            Member or session
            <input name="q" defaultValue={data.query.q} maxLength={100} />
          </label>
          <button className="button secondary">Apply filters</button>
        </Form>
        <div className="platform-heading-actions">
          <Link className="button secondary" href={"/trainers" + scope}>
            Trainer profiles
          </Link>
          {coach ? (
            <Link
              className="button secondary"
              href={"/classes" + scope + "&trainerId=" + coach.id}
            >
              Availability & classes
            </Link>
          ) : null}
          <button
            className="button secondary"
            disabled={!!editor}
            onClick={() =>
              reload().catch(() => {
                setBlocked(true);
                setError(
                  "Could not refresh. Reload latest before another change.",
                );
              })
            }
          >
            Refresh agenda
          </button>
        </div>
        {!coach ? (
          <p className="dashboard-empty">
            No trainer profile is available in this scope. An owner or manager
            can add a profile and branch assignment first.
          </p>
        ) : !coach.active ? (
          <p className="support">
            This trainer is inactive. Historical assignments and sessions remain
            visible; new bookings are unavailable.
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {blocked ? (
          <p className="form-error" role="alert">
            A change may already be saved. Refresh the agenda before another
            change.
          </p>
        ) : null}
      </section>
      <div className="pt-sections">
        <section className="panel">
          <SectionTitle
            title="Assigned members"
            help="Effective dates are inclusive at the start and exclusive at the end. Close an assignment after resolving its upcoming sessions. Contact details, notes and financial history are not exposed to trainer-only accounts."
          />
          {!blocked ? (
            <div className="table-scroll">
              <ResponsiveTable aria-label="Trainer member assignments">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Effective dates</th>
                    <th>Status</th>
                    <th>Branch</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.assignments.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.memberName}</strong>
                        <small>{a.memberCode}</small>
                      </td>
                      <td>
                        {a.startOn}
                        <small>
                          {a.endOn
                            ? "Until " + a.endOn + " (exclusive)"
                            : "No end date"}
                        </small>
                      </td>
                      <td>
                        {a.archived
                          ? "Member archived"
                          : !a.active
                            ? "Closed"
                            : a.startOn > data.organization.today
                              ? "Scheduled"
                              : a.endOn && a.endOn <= data.organization.today
                                ? "Ended"
                                : "Current"}
                      </td>
                      <td>{a.branchName}</td>
                      <td>
                        <div className="pt-row-actions">
                          {data.canBook &&
                          coach?.active &&
                          a.active &&
                          !a.archived &&
                          (!a.endOn || a.endOn > data.organization.today) ? (
                            <button
                              className="button secondary"
                              aria-label={"Book PT for " + a.memberName}
                              onClick={() =>
                                setEditor({ kind: "session", assignment: a })
                              }
                            >
                              Book PT
                            </button>
                          ) : null}
                          {data.canManage ? (
                            <button
                              className="button secondary"
                              aria-label={"Edit assignment for " + a.memberName}
                              onClick={() =>
                                setEditor({ kind: "assignment", assignment: a })
                              }
                            >
                              Edit assignment
                            </button>
                          ) : null}
                          {data.own ? (
                            <span>Assigned coaching member</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable>
            </div>
          ) : null}
          {!data.assignments.length && !blocked ? (
            <p className="dashboard-empty">
              No matching assignments. An owner or manager assigns members
              before PT bookings.
            </p>
          ) : null}
          <div className="class-page-nav">
            <span>
              {data.assignmentTotal} assignments / page {data.assignmentPage}
            </span>
            {data.assignmentPage > 1 ? (
              <Link
                className="button secondary"
                href={href({ assignmentPage: String(data.assignmentPage - 1) })}
              >
                Previous assignments
              </Link>
            ) : null}
            {data.assignmentPage * 25 < data.assignmentTotal ? (
              <Link
                className="button secondary"
                href={href({ assignmentPage: String(data.assignmentPage + 1) })}
              >
                Next assignments
              </Link>
            ) : null}
          </div>
        </section>
        <section className="panel">
          <SectionTitle
            title="Personal sessions"
            help="Scheduled sessions retain cancellations and original member assignments. Past scheduled sessions are not proof of attendance. Adjacent sessions are allowed; a booked class or another PT session cannot overlap for the same member."
          />
          {!blocked ? (
            <div className="table-scroll">
              <ResponsiveTable aria-label="Personal training sessions">
                <thead>
                  <tr>
                    <th>Session & member</th>
                    <th>Gym-local time</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.title}</strong>
                        <small>
                          {s.memberName} / {s.memberCode}
                        </small>
                      </td>
                      <td>
                        {time(s.startsAt)}
                        <small>Until {time(s.endsAt)}</small>
                      </td>
                      <td>
                        {s.branchName}
                        <small>{s.roomName ?? "Open floor"}</small>
                      </td>
                      <td>
                        {s.cancelled
                          ? "Cancelled"
                          : s.upcoming
                            ? "Scheduled"
                            : "Past scheduled"}
                        {s.cancelled ? (
                          <small>{s.cancellationReason}</small>
                        ) : null}
                      </td>
                      <td>
                        {data.canBook && s.upcoming ? (
                          <div className="pt-row-actions">
                            <button
                              className="button secondary"
                              onClick={() => {
                                const a =
                                  data.assignments.find(
                                    (a) => a.id === s.assignmentId,
                                  ) ??
                                  data.sessionAssignments.find(
                                    (a) => a.id === s.assignmentId,
                                  );
                                if (a)
                                  setEditor({
                                    kind: "session",
                                    assignment: a,
                                    session: s,
                                  });
                                else
                                  setError(
                                    "Find the assigned member on the assignments page before editing this session.",
                                  );
                              }}
                              aria-label={"Edit " + s.title}
                            >
                              Edit
                            </button>
                            <button
                              className="button secondary"
                              onClick={() =>
                                setEditor({ kind: "cancel", session: s })
                              }
                              aria-label={"Cancel " + s.title}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span>Retained history</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable>
            </div>
          ) : null}
          {!data.sessions.length && !blocked ? (
            <p className="dashboard-empty">
              No personal sessions match this date range.
            </p>
          ) : null}
          <div className="class-page-nav">
            <span>
              {data.total} sessions / page {data.page}
            </span>
            {data.page > 1 ? (
              <Link
                className="button secondary"
                href={href({ page: String(data.page - 1) })}
              >
                Previous sessions
              </Link>
            ) : null}
            {data.page * 50 < data.total ? (
              <Link
                className="button secondary"
                href={href({ page: String(data.page + 1) })}
              >
                Next sessions
              </Link>
            ) : null}
          </div>
        </section>
      </div>
      {editor ? (
        <TrainingEditor
          action={editor}
          data={data}
          onClose={() => setEditor(null)}
          saved={reload}
          onBlock={() => setBlocked(true)}
        />
      ) : null}
    </WorkspaceFrame>
  );
}
function TrainingEditor({
  action,
  data,
  onClose,
  saved,
  onBlock,
}: {
  action: Action;
  data: Agenda;
  onClose: () => void;
  saved: () => Promise<void>;
  onBlock: () => void;
}) {
  const assignment =
      action.kind === "assignment"
        ? action.assignment
        : action.kind === "session"
          ? action.assignment
          : undefined,
    session = action.kind !== "assignment" ? action.session : undefined,
    coach = data.trainers.find((t) => t.id === data.trainerId);
  const [key, setKey] = useState(() => crypto.randomUUID()),
    [id] = useState(() =>
      assignment && action.kind === "assignment"
        ? assignment.id
        : (session?.id ?? crypto.randomUUID()),
    ),
    [prepared, setPrepared] = useState<ReturnType<
      typeof ptMutation.parse
    > | null>(null),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const [draft, setDraft] = useState<{
    title?: string;
    startOn?: string;
    endOn?: string;
    active?: boolean;
    roomId?: string;
    reason?: string;
  }>({});
  const [branch, setBranch] = useState(
      assignment?.branchId ??
        (data.query.branchId && coach?.branchIds.includes(data.query.branchId)
          ? data.query.branchId
          : (coach?.branchIds[0] ?? "")),
    ),
    [query, setQuery] = useState(""),
    [choices, setChoices] = useState<
      { id: string; name: string; memberCode: string }[]
    >([]),
    [memberId, setMemberId] = useState(assignment?.memberId ?? ""),
    [finding, setFinding] = useState(false);
  const day =
      assignment && assignment.startOn > data.organization.today
        ? assignment.startOn
        : shiftDate(data.organization.today, 1),
    zone = data.organization.timeZone;
  const [start, setStart] = useState(
      session ? localInput(session.startsAt, zone) : day + "T12:00",
    ),
    [end, setEnd] = useState(
      session ? localInput(session.endsAt, zone) : day + "T13:00",
    ),
    [startOffset, setStartOffset] = useState(
      offset(session?.startsAt ?? day + "T12:00:00Z", zone),
    ),
    [endOffset, setEndOffset] = useState(
      offset(session?.endsAt ?? day + "T13:00:00Z", zone),
    );
  useEffect(() => {
    if (action.kind !== "assignment" || done || assignment || !branch || !coach)
      return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setFinding(true);
      try {
        const r = await fetch(
            "/api/training/members?" +
              new URLSearchParams({
                organizationId: data.organization.id,
                branchId: branch,
                trainerId: coach.id,
                q: query,
              }),
            { signal: abort.signal, cache: "no-store" },
          ),
          j = await r.json();
        if (!r.ok) throw Error(j.error?.message ?? "Could not find members.");
        if (!abort.signal.aborted) setChoices(j.data.rows);
      } catch (e) {
        if (!abort.signal.aborted) {
          setChoices([]);
          setError(e instanceof Error ? e.message : "Member search failed.");
        }
      } finally {
        if (!abort.signal.aborted) setFinding(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [action.kind, assignment, branch, coach, data.organization.id, done, query]);
  function close() {
    if (attempted && !done) onBlock();
    onClose();
  }
  return (
    <Drawer
      title={
        action.kind === "cancel"
          ? "Cancel personal session"
          : action.kind === "assignment"
            ? assignment
              ? "Edit trainer assignment"
              : "Assign member"
            : session
              ? "Edit personal session"
              : "Book personal session"
      }
      busy={busy}
      onClose={close}
    >
      {done ? (
        <section>
          <SectionTitle
            title="Training change saved"
            help="Your training change is saved. Close this panel to review the coaching agenda."
          />
          <button className="button primary" onClick={close}>
            Done
          </button>
        </section>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (!prepared) {
              const form = new FormData(e.currentTarget);
              setDraft({
                title: String(form.get("title") ?? ""),
                startOn: String(form.get("startOn") ?? ""),
                endOn: String(form.get("endOn") ?? ""),
                active: form.get("active") === "on",
                roomId: String(form.get("roomId") ?? ""),
                reason: String(form.get("reason") ?? ""),
              });
              const common = {
                organizationId: data.organization.id,
                id,
                requestKey: key,
                reason: String(form.get("reason")),
              };
              const raw =
                action.kind === "assignment"
                  ? {
                      ...common,
                      operation: "assignment",
                      ...(assignment ? { version: assignment.version } : {}),
                      trainerId: assignment?.trainerId ?? data.trainerId,
                      branchId: branch,
                      memberId,
                      startOn: String(form.get("startOn")),
                      endOn: String(form.get("endOn")) || null,
                      active: form.get("active") === "on",
                    }
                  : action.kind === "cancel"
                    ? {
                        ...common,
                        operation: "cancel",
                        version: action.session.version,
                      }
                    : {
                        ...common,
                        operation: "session",
                        ...(session ? { version: session.version } : {}),
                        assignmentId: action.assignment.id,
                        roomId: String(form.get("roomId")) || null,
                        title: String(form.get("title")),
                        startsAt: start + ":00" + startOffset,
                        endsAt: end + ":00" + endOffset,
                      };
              const parsed = ptMutation.safeParse(raw);
              if (!parsed.success) {
                setError(
                  parsed.error.issues
                    .slice(0, 3)
                    .map((i) => i.message)
                    .join("; "),
                );
                return;
              }
              setPrepared(parsed.data);
              return;
            }
            setBusy(true);
            setAttempted(true);
            try {
              const r = await fetch("/api/training", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(prepared),
                }),
                j = await r.json();
              if (!r.ok) {
                if (r.status < 500) setAttempted(false);
                throw Error(j.error?.message ?? "Could not save training.");
              }
              setDone(true);
              try {
                await saved();
              } catch {
                onBlock();
                setError("Saved. Refresh the agenda before another change.");
              }
            } catch (e) {
              setError(
                e instanceof TypeError
                  ? "Could not reach the server. Retry checks the same reviewed change."
                  : e instanceof Error
                    ? e.message
                    : "Could not save.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset className="drawer-fields" disabled={busy}>
            {!prepared ? (
              <>
                <SectionTitle
                  title="Training details"
                  help="Review the effective dates and gym-local times before confirming. New sessions require PT membership benefits, a covering assignment and saved availability. Changes are recorded with your reason."
                />
                {action.kind === "assignment" ? (
                  <>
                    <p>
                      Trainer: <strong>{coach?.name}</strong>
                    </p>
                    <label>
                      Assignment branch
                      <select
                        aria-label="Assignment branch"
                        value={branch}
                        disabled={!!assignment}
                        onChange={(e) => {
                          setBranch(e.target.value);
                          setMemberId("");
                        }}
                      >
                        {data.branches
                          .filter((b) =>
                            assignment
                              ? b.id === assignment.branchId
                              : coach?.branchIds.includes(b.id),
                          )
                          .map((b) => (
                            <option value={b.id} key={b.id}>
                              {b.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    {assignment ? (
                      <p>
                        Member:{" "}
                        <strong>
                          {assignment.memberName} / {assignment.memberCode}
                        </strong>
                      </p>
                    ) : (
                      <>
                        <label>
                          Find member
                          <input
                            value={query}
                            maxLength={100}
                            onChange={(e) => {
                              setQuery(e.target.value);
                              setMemberId("");
                              setError("");
                            }}
                          />
                        </label>
                        <label>
                          Member to assign
                          <select
                            aria-label="Member to assign"
                            required
                            value={memberId}
                            onChange={(e) => setMemberId(e.target.value)}
                            disabled={finding}
                          >
                            <option value="">
                              {finding ? "Searching..." : "Choose a member"}
                            </option>
                            {choices.map((m) => (
                              <option value={m.id} key={m.id}>
                                {m.name} / {m.memberCode}
                              </option>
                            ))}
                          </select>
                        </label>
                        <p className="support">
                          Up to25authorized active members are shown. Narrow the
                          search by name or member code.
                        </p>
                      </>
                    )}
                    <label>
                      Assignment start date
                      <input
                        name="startOn"
                        type="date"
                        required
                        defaultValue={
                          draft.startOn ??
                          assignment?.startOn ??
                          data.organization.today
                        }
                      />
                    </label>
                    <label>
                      Assignment end date (exclusive)
                      <input
                        name="endOn"
                        type="date"
                        defaultValue={draft.endOn ?? assignment?.endOn ?? ""}
                      />
                    </label>
                    <label>
                      <input
                        name="active"
                        type="checkbox"
                        defaultChecked={
                          draft.active ?? assignment?.active ?? true
                        }
                      />{" "}
                      Active assignment
                    </label>
                  </>
                ) : action.kind === "session" ? (
                  <>
                    <p>
                      Member: <strong>{action.assignment.memberName}</strong>
                      <br />
                      Trainer: {coach?.name}
                    </p>
                    <label>
                      Session title
                      <input
                        name="title"
                        required
                        minLength={3}
                        maxLength={120}
                        defaultValue={
                          draft.title ?? session?.title ?? "Personal training"
                        }
                      />
                    </label>
                    <label>
                      Starts at ({zone})
                      <input
                        required
                        type="datetime-local"
                        value={start}
                        onChange={(e) => {
                          setStart(e.target.value);
                          if (e.target.value)
                            setStartOffset(
                              offset(e.target.value + ":00Z", zone),
                            );
                        }}
                      />
                    </label>
                    <label>
                      Ends at ({zone})
                      <input
                        required
                        type="datetime-local"
                        value={end}
                        onChange={(e) => {
                          setEnd(e.target.value);
                          if (e.target.value)
                            setEndOffset(offset(e.target.value + ":00Z", zone));
                        }}
                      />
                    </label>
                    <div className="pt-offsets">
                      <label>
                        Start UTC offset
                        <input
                          required
                          pattern="[+-][0-9]{2}:[0-9]{2}"
                          value={startOffset}
                          onChange={(e) => setStartOffset(e.target.value)}
                        />
                      </label>
                      <label>
                        End UTC offset
                        <input
                          required
                          pattern="[+-][0-9]{2}:[0-9]{2}"
                          value={endOffset}
                          onChange={(e) => setEndOffset(e.target.value)}
                        />
                      </label>
                    </div>
                    <p className="support">
                      Offsets are checked against the gym time zone on the
                      selected date. For repeated daylight-saving clock times,
                      choose the intended offset explicitly.
                    </p>
                    <label>
                      Room
                      <select
                        name="roomId"
                        aria-label="Room"
                        defaultValue={draft.roomId ?? session?.roomId ?? ""}
                      >
                        <option value="">Open floor (no room)</option>
                        {data.rooms
                          .filter(
                            (r) => r.branchId === action.assignment.branchId,
                          )
                          .map((r) => (
                            <option value={r.id} key={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <p>
                    Cancel <strong>{action.session.title}</strong> for{" "}
                    {action.session.memberName}? The original session remains in
                    history and its trainer, room and member time become
                    available.
                  </p>
                )}
                <label>
                  Reason
                  <textarea
                    name="reason"
                    aria-label="Reason"
                    defaultValue={draft.reason ?? ""}
                    required
                    minLength={3}
                    maxLength={300}
                  />
                </label>
              </>
            ) : (
              <section className="membership-review">
                <SectionTitle
                  title="Review training change"
                  help="Confirming saves the reviewed change once. Retry after a lost response uses the same request; no duplicate session or assignment is created."
                />
                <dl className="registration-summary">
                  <dt>Operation</dt>
                  <dd>
                    {prepared.operation === "assignment"
                      ? "Trainer assignment"
                      : prepared.operation === "cancel"
                        ? "Cancel personal session"
                        : "Personal session"}
                  </dd>
                  {prepared.operation === "assignment" ? (
                    <>
                      <dt>Member</dt>
                      <dd>
                        {assignment?.memberName ??
                          choices.find((m) => m.id === memberId)?.name}
                      </dd>
                      <dt>Dates</dt>
                      <dd>
                        {prepared.startOn} through{" "}
                        {prepared.endOn ?? "no end date"}
                        {prepared.endOn ? " (exclusive)" : ""}
                      </dd>
                      <dt>Status</dt>
                      <dd>{prepared.active ? "Active" : "Closed"}</dd>
                    </>
                  ) : prepared.operation === "session" ? (
                    <>
                      <dt>Member</dt>
                      <dd>
                        {action.kind === "session"
                          ? action.assignment.memberName
                          : ""}
                      </dd>
                      <dt>Starts</dt>
                      <dd>{prepared.startsAt}</dd>
                      <dt>Ends</dt>
                      <dd>{prepared.endsAt}</dd>
                    </>
                  ) : null}
                  <dt>Reason</dt>
                  <dd>{prepared.reason}</dd>
                </dl>
              </section>
            )}
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="fee-actions">
              {prepared && !attempted ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setPrepared(null);
                    setKey(crypto.randomUUID());
                    setError("");
                  }}
                >
                  Back to edit
                </button>
              ) : null}
              <button className="button primary">
                {busy
                  ? "Saving..."
                  : prepared
                    ? "Confirm training change"
                    : "Review training change"}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {done && error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Drawer>
  );
}
