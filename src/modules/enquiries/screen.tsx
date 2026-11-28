"use client";
import Form from "next/form";
import Link from "next/link";
import { useState } from "react";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { SectionTitle } from "@/components/ui/section-title";
import { Drawer, Table } from "@/components/ui/primitives";
import { localInput, offset } from "@/lib/schedule-clock";
import { exactMoney } from "@/modules/billing/format";
import { endOn } from "@/modules/plans/format";
import { invalidateMemberFeeViews } from "@/modules/member-fees/invalidate";
import { enquiryMutation, stages } from "./schemas";
import type { EnquiriesData, Enquiry, FollowUp } from "./service";
import styles from "./styles.module.css";
const labels: Record<string, string> = {
  new: "New enquiry",
  contacted: "Contacted",
  trial_booked: "Trial booked",
  joined: "Joined",
  lost: "Lost",
};
type Action =
  | { kind: "create" }
  | { kind: "edit" | "task" | "convert"; record: Enquiry }
  | { kind: "complete_task"; task: FollowUp };
export function EnquiriesScreen({ initial }: { initial: EnquiriesData }) {
  const [data, setData] = useState(initial),
    [action, setAction] = useState<Action | null>(null),
    [error, setError] = useState(""),
    [blocked, setBlocked] = useState(false),
    [refreshing, setRefreshing] = useState(false);
  const query = new URLSearchParams(
    Object.entries(data.query)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
  const href = (extra: Record<string, string>) => {
    const q = new URLSearchParams(query);
    Object.entries(extra).forEach(([k, v]) => (v ? q.set(k, v) : q.delete(k)));
    return "/enquiries?" + q;
  };
  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const r = await fetch("/api/enquiries?" + query, { cache: "no-store" }),
        j = await r.json();
      if (!r.ok) throw Error(j.error?.message ?? "Could not load enquiries.");
      setData(j.data);
      setBlocked(false);
    } catch (e) {
      setBlocked(true);
      setError(e instanceof Error ? e.message : "Could not refresh enquiries.");
    } finally {
      setRefreshing(false);
    }
  }
  const locked = blocked || refreshing;
  const when = (value: string) =>
    new Intl.DateTimeFormat("en-PK", {
      timeZone: data.organization.timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  function controls(e: Enquiry, selected = false) {
    return (
      <div className={styles.actions}>
        {!selected && (
          <Link href={href({ selectedId: e.id, taskPage: "1" })}>Details</Link>
        )}
        {e.convertedMemberId ? (
          <Link
            href={
              "/members/" +
              e.convertedMemberId +
              "?organizationId=" +
              data.organization.id
            }
          >
            Open member
          </Link>
        ) : (
          <>
            <button
              disabled={locked}
              onClick={() => setAction({ kind: "edit", record: e })}
            >
              Edit
            </button>
            <button
              disabled={locked || e.stage === "lost"}
              onClick={() => setAction({ kind: "convert", record: e })}
            >
              Convert to member
            </button>
          </>
        )}
        <button
          disabled={locked}
          onClick={() => setAction({ kind: "task", record: e })}
        >
          Add follow-up
        </button>
      </div>
    );
  }
  return (
    <WorkspaceFrame
      organization={data.organization}
      active="enquiries"
      canManageFees={data.canManageFees}
      canManageSettings={data.canManageSettings}
      canManageMembers
      canReadPlans={data.canReadPlans}
      canReadBilling
    >
      <div className={styles.sections}>
        <section className="page-heading">
          <div>
            <h1>Enquiries & trials</h1>
            <p>
              Keep prospective members, trial dates and follow-ups organized.
            </p>
          </div>
          <div className={styles.actions}>
            <button disabled={refreshing || !!action} onClick={refresh}>
              Refresh enquiries
            </button>
            <button
              className="primary"
              disabled={locked || !!action}
              onClick={() => setAction({ kind: "create" })}
            >
              Add enquiry
            </button>
          </div>
        </section>
        {error && (
          <p role="alert">{error} Reload successfully before another change.</p>
        )}
        <Form action="/enquiries" className={styles.filters}>
          <input
            type="hidden"
            name="organizationId"
            value={data.organization.id}
          />
          <input type="hidden" name="view" value={data.query.view} />
          <label>
            Search
            <input
              name="q"
              defaultValue={data.query.q}
              placeholder="Name, phone, email or interest"
              maxLength={100}
            />
          </label>
          <label>
            Branch
            <select
              aria-label="Branch"
              name="branchId"
              defaultValue={data.query.branchId ?? ""}
            >
              <option value="">All authorized branches</option>
              {data.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stage
            <select
              aria-label="Stage filter"
              name="stage"
              defaultValue={data.query.stage ?? ""}
            >
              <option value="">All stages</option>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {labels[s]}
                </option>
              ))}
            </select>
          </label>
          <button>Apply filters</button>
        </Form>
        <section className="panel">
          <SectionTitle
            title="Enquiry pipeline"
            help="Stages persist across visits. Joined enquiries link to one member. Trial bookings record an appointment and do not grant membership access. Pipeline counts reflect the current filters; cards show the current page."
          />
          <nav className={styles.actions} aria-label="Enquiry view">
            <Link
              aria-current={data.query.view === "pipeline" ? "page" : undefined}
              href={href({ view: "pipeline" })}
            >
              Pipeline
            </Link>
            <Link
              aria-current={data.query.view === "list" ? "page" : undefined}
              href={href({ view: "list" })}
            >
              List
            </Link>
            <span>{data.total} enquiries</span>
          </nav>
          {data.query.view === "pipeline" ? (
            <div className={styles.pipeline}>
              {stages.map((stage) => (
                <section key={stage} className={styles.column}>
                  <h3>
                    {labels[stage]} <span>{data.counts[stage] ?? 0}</span>
                  </h3>
                  {data.rows
                    .filter((e) => e.stage === stage)
                    .map((e) => (
                      <article className={styles.card} key={e.id}>
                        <strong>{e.name}</strong>
                        <p>{e.interest || "No interest recorded"}</p>
                        <small>{e.branchName}</small>
                        {e.trialAt && <p>Trial {when(e.trialAt)}</p>}
                        <p>{e.assigneeName ?? "Unassigned"}</p>
                        <div className={styles.actions}>
                          <Link
                            href={href({ selectedId: e.id, taskPage: "1" })}
                          >
                            Details
                          </Link>
                        </div>
                      </article>
                    ))}
                  {!data.rows.some((e) => e.stage === stage) && (
                    <p className="support">No records on this page.</p>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <Table caption="Enquiry directory">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Stage / trial</th>
                  <th>Assignee / branch</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <strong>{e.name}</strong>
                      <small>{e.interest}</small>
                    </td>
                    <td>
                      {e.phone || "No phone"}
                      <small>{e.email || "No email"}</small>
                      <small>
                        {e.contactAllowed
                          ? "Contact permitted"
                          : "Contact permission not recorded"}
                      </small>
                    </td>
                    <td>
                      {labels[e.stage]}
                      {e.trialAt && <small>{when(e.trialAt)}</small>}
                    </td>
                    <td>
                      {e.assigneeName ?? "Unassigned"}
                      <small>{e.branchName}</small>
                    </td>
                    <td>{controls(e)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {!data.total && <p>No enquiries match these filters.</p>}
          <nav className={styles.actions} aria-label="Enquiry pages">
            {data.query.page > 1 && (
              <Link href={href({ page: String(data.query.page - 1) })}>
                Previous enquiries
              </Link>
            )}
            <span>Page {data.query.page} · 25 records per page</span>
            {data.query.page * 25 < data.total && (
              <Link href={href({ page: String(data.query.page + 1) })}>
                Next enquiries
              </Link>
            )}
          </nav>
        </section>
        {data.selected && (
          <section className="panel">
            <SectionTitle
              title={data.selected.name}
              help="Contact permission and stage history belong to this enquiry. Conversion retains this record and opens a separate member profile."
            />
            <p>
              {data.selected.phone || "No phone"} ·{" "}
              {data.selected.email || "No email"}
            </p>
            <p>
              {data.selected.contactAllowed
                ? "Contact permitted"
                : "Contact permission not recorded"}
            </p>
            <p>{data.selected.interest}</p>
            {controls(data.selected, true)}
            <h3>Recent history</h3>
            <p className="support">
              Latest 50 changes. Full history is retained.
            </p>
            <ol className={styles.history}>
              {data.history.map((h, i) => (
                <li key={i}>
                  <strong>
                    {h.action.replace("enquiry.", "").replaceAll("_", " ")}
                  </strong>
                  <p>{h.reason}</p>
                  <small>{when(h.at)}</small>
                </li>
              ))}
            </ol>
            <Link href={href({ selectedId: "", taskPage: "1" })}>
              Show all follow-ups
            </Link>
          </section>
        )}
        <section className="panel">
          <SectionTitle
            title="Follow-ups"
            help="Internal tasks retain their due date and completion history. Mark done records the staff member and completion time. No message is sent by completing a task."
          />
          <p>
            {data.dueTasks} open tasks due today or overdue in this selection ·{" "}
            {data.organization.today}
          </p>
          <nav className={styles.actions} aria-label="Follow-up status">
            {["open", "done", "all"].map((s) => (
              <Link
                key={s}
                aria-current={data.query.taskStatus === s ? "page" : undefined}
                href={href({ taskStatus: s, taskPage: "1" })}
              >
                {s === "done"
                  ? "Completed"
                  : s === "all"
                    ? "All tasks"
                    : "Open tasks"}
              </Link>
            ))}
          </nav>
          <Table caption="Follow-up tasks">
            <thead>
              <tr>
                <th>Name</th>
                <th>Planned action</th>
                <th>Due date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.tasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.action}</td>
                  <td>{t.dueOn}</td>
                  <td>
                    {t.completedAt
                      ? "Completed " + when(t.completedAt)
                      : "Open"}
                  </td>
                  <td>
                    {!t.completedAt && (
                      <button
                        disabled={locked}
                        onClick={() =>
                          setAction({ kind: "complete_task", task: t })
                        }
                      >
                        Mark done
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!data.tasks.length && (
            <p>No follow-up tasks match this selection.</p>
          )}
          <nav className={styles.actions} aria-label="Follow-up pages">
            {data.query.taskPage > 1 && (
              <Link href={href({ taskPage: String(data.query.taskPage - 1) })}>
                Previous tasks
              </Link>
            )}
            <span>
              {data.taskTotal} tasks · Page {data.query.taskPage}
            </span>
            {data.query.taskPage * 25 < data.taskTotal && (
              <Link href={href({ taskPage: String(data.query.taskPage + 1) })}>
                Next tasks
              </Link>
            )}
          </nav>
        </section>
      </div>
      {action && (
        <EnquiryEditor
          action={action}
          data={data}
          onClose={() => setAction(null)}
          onSaved={async () => {
            setAction(null);
            setBlocked(true);
            await refresh();
          }}
          onUncertain={() => setBlocked(true)}
        />
      )}
    </WorkspaceFrame>
  );
}

function EnquiryEditor({
  action,
  data,
  onClose,
  onSaved,
  onUncertain,
}: {
  action: Action;
  data: EnquiriesData;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onUncertain: () => void;
}) {
  const record = "record" in action ? action.record : undefined;
  const [branchId, setBranchId] = useState(
      record?.branchId ?? data.query.branchId ?? data.branches[0]?.id ?? "",
    ),
    [stage, setStage] = useState(record?.stage ?? "new"),
    [mode, setMode] = useState("later"),
    [trial, setTrial] = useState(
      record?.trialAt
        ? localInput(record.trialAt, data.organization.timeZone)
        : "",
    );
  const [key] = useState(() => crypto.randomUUID()),
    [id] = useState(
      () =>
        record?.id ??
        ("task" in action ? action.task.enquiryId : crypto.randomUUID()),
    );
  const [review, setReview] = useState<Record<string, unknown> | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [attempted, setAttempted] = useState(false),
    [saved, setSaved] = useState<{ memberId: string | null } | null>(null);
  const defaultOffset = offset(
    new Date().toISOString(),
    data.organization.timeZone,
  );
  const title =
    action.kind === "create"
      ? "Add enquiry"
      : action.kind === "edit"
        ? "Edit enquiry"
        : action.kind === "task"
          ? "Add follow-up"
          : action.kind === "convert"
            ? "Convert to member"
            : "Complete follow-up";
  async function commit() {
    setPending(true);
    setError("");
    setAttempted(true);
    try {
      const r = await fetch("/api/enquiries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(review),
        }),
        j = await r.json();
      if (!r.ok) {
        if (r.status < 500) setAttempted(false);
        throw Error(j.error?.message ?? "Could not save enquiry.");
      }
      setSaved(j.data);
      if (action.kind === "convert")
        await invalidateMemberFeeViews(data.organization.id).catch(
          () => undefined,
        );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not read the server response. Retry uses the same request.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Drawer
      title={title}
      busy={pending}
      onClose={() => {
        if (attempted && !saved) onUncertain();
        onClose();
      }}
    >
      {saved ? (
        <>
          <p role="status">Enquiry change saved.</p>
          {saved.memberId && (
            <Link
              href={
                "/members/" +
                saved.memberId +
                "?organizationId=" +
                data.organization.id
              }
            >
              Open converted member
            </Link>
          )}
          <button className="primary" onClick={onSaved}>
            Done
          </button>
        </>
      ) : (
        <>
          {error && <p role="alert">{error}</p>}
          <form
            hidden={!!review}
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              const f = new FormData(e.currentTarget),
                text = (n: string) => String(f.get(n) ?? "");
              let body: Record<string, unknown> = {
                organizationId: data.organization.id,
                id,
                requestKey: key,
                operation: action.kind,
                reason: text("reason"),
              };
              if (action.kind === "create" || action.kind === "edit")
                body = {
                  ...body,
                  ...(record ? { version: record.version } : { branchId }),
                  name: text("name"),
                  email: text("email"),
                  phone: text("phone"),
                  interest: text("interest"),
                  contactAllowed: f.has("contactAllowed"),
                  assigneeId: text("assigneeId") || null,
                  stage,
                  trialAt:
                    record?.trialAt &&
                    trial ===
                      localInput(record.trialAt, data.organization.timeZone) &&
                    text("offset") ===
                      offset(record.trialAt, data.organization.timeZone)
                      ? record.trialAt
                      : trial
                        ? trial + ":00" + text("offset")
                        : null,
                };
              if (action.kind === "task")
                body = {
                  ...body,
                  action: text("action"),
                  dueOn: text("dueOn"),
                };
              if (action.kind === "complete_task")
                body = { ...body, taskId: action.task.id };
              if (action.kind === "convert")
                body = {
                  ...body,
                  version: record!.version,
                  joinedOn: text("joinedOn"),
                  sharedContactReason: text("sharedContactReason"),
                  enrollment:
                    mode === "enroll"
                      ? {
                          mode,
                          planVersionId: text("planVersionId"),
                          startOn: text("startOn"),
                        }
                      : { mode },
                };
              const parsed = enquiryMutation.safeParse(body);
              if (!parsed.success) {
                setError(
                  parsed.error.issues
                    .slice(0, 3)
                    .map((i) => i.path.join(".") + " " + i.message)
                    .join("; "),
                );
                return;
              }
              setReview(parsed.data);
            }}
          >
            {(action.kind === "create" || action.kind === "edit") && (
              <>
                <SectionTitle
                  title="Enquiry details"
                  help="Record contact details, permission and the next stage. Booking a trial stores an appointment only."
                />
                {!record && (
                  <label className="field">
                    Branch
                    <select
                      aria-label="Enquiry branch"
                      value={branchId}
                      onChange={(e) => setBranchId(e.target.value)}
                      required
                    >
                      {data.branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="field">
                  Name
                  <input
                    name="name"
                    required
                    maxLength={100}
                    defaultValue={record?.name}
                  />
                </label>
                <label className="field">
                  Phone
                  <input
                    name="phone"
                    type="tel"
                    maxLength={40}
                    defaultValue={record?.phone}
                  />
                </label>
                <label className="field">
                  Email
                  <input
                    name="email"
                    type="email"
                    maxLength={254}
                    defaultValue={record?.email}
                  />
                </label>
                <label className="field">
                  Interest
                  <input
                    name="interest"
                    maxLength={300}
                    defaultValue={record?.interest}
                  />
                </label>
                <label>
                  <input
                    name="contactAllowed"
                    type="checkbox"
                    defaultChecked={record?.contactAllowed}
                  />{" "}
                  Permission to contact recorded
                </label>
                <label className="field">
                  Assigned staff
                  <select
                    aria-label="Assigned staff"
                    name="assigneeId"
                    defaultValue={record?.assigneeId ?? ""}
                  >
                    <option value="">Unassigned</option>
                    {record?.assigneeId &&
                      !data.staff.some(
                        (s) =>
                          s.id === record.assigneeId &&
                          s.branchIds.includes(branchId),
                      ) && (
                        <option value={record.assigneeId} disabled>
                          {record.assigneeName ?? "Previous assignee"}{" "}
                          (unavailable — choose another)
                        </option>
                      )}
                    {data.staff
                      .filter((s) => s.branchIds.includes(branchId))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  Stage
                  <select
                    aria-label="Enquiry stage"
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                  >
                    {stages
                      .filter((s) => s !== "joined")
                      .map((s) => (
                        <option key={s} value={s}>
                          {labels[s]}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  Trial date and time ({data.organization.timeZone})
                  <input
                    name="trialAt"
                    type="datetime-local"
                    value={trial}
                    onChange={(e) => setTrial(e.target.value)}
                    required={stage === "trial_booked"}
                  />
                </label>
                <label className="field">
                  Trial UTC offset
                  <input
                    aria-label="Trial UTC offset"
                    name="offset"
                    defaultValue={
                      record?.trialAt
                        ? offset(record.trialAt, data.organization.timeZone)
                        : defaultOffset
                    }
                    pattern="[+-][0-9]{2}:[0-9]{2}"
                    required
                  />
                </label>
              </>
            )}
            {action.kind === "task" && (
              <>
                <p>Follow up with {record?.name}.</p>
                <label className="field">
                  Planned action
                  <input name="action" required minLength={3} maxLength={300} />
                </label>
                <label className="field">
                  Due date
                  <input
                    name="dueOn"
                    type="date"
                    required
                    defaultValue={data.organization.today}
                  />
                </label>
              </>
            )}
            {action.kind === "complete_task" && (
              <p>
                Mark “{action.task.action}” for {action.task.name} as completed.
              </p>
            )}
            {action.kind === "convert" && (
              <>
                <SectionTitle
                  title="Member registration"
                  help="Creates one member and links this enquiry permanently. Choose whether to enroll now. Enrollment issues an invoice; received payments are recorded separately."
                />
                <p>
                  {record?.name} ·{" "}
                  {record?.phone ||
                    record?.email ||
                    "Add contact details before conversion."}
                </p>
                <label className="field">
                  Joining date
                  <input
                    name="joinedOn"
                    type="date"
                    required
                    max={data.organization.today}
                    defaultValue={data.organization.today}
                  />
                </label>
                <label className="field">
                  Enrollment
                  <select
                    aria-label="Enrollment"
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    <option value="later">Register only, enroll later</option>
                    <option value="enroll">Enroll in a plan now</option>
                  </select>
                </label>
                {mode === "enroll" && (
                  <>
                    <label className="field">
                      Membership plan
                      <select
                        aria-label="Membership plan"
                        name="planVersionId"
                        required
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Choose plan
                        </option>
                        {data.plans
                          .filter((p) => p.branchId === branchId)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {exactMoney(p.amountMinor, p.currency)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="field">
                      Membership start
                      <input
                        name="startOn"
                        type="date"
                        required
                        defaultValue={data.organization.today}
                      />
                    </label>
                  </>
                )}
                <label className="field">
                  Shared contact explanation (if needed)
                  <input name="sharedContactReason" maxLength={300} />
                  <small>
                    If another member uses the same contact, review that person
                    first. Explain a legitimate shared contact before retrying
                    conversion.
                  </small>
                </label>
              </>
            )}
            <label className="field">
              Reason
              <input
                name="reason"
                required
                minLength={3}
                maxLength={300}
                defaultValue={
                  action.kind === "create" ? "New enquiry registration" : ""
                }
              />
            </label>
            <button type="submit" className="primary">
              Review change
            </button>
          </form>
          {review && (
            <div className={styles.review}>
              <SectionTitle
                title="Review enquiry change"
                help="Check the values before saving. Retry a lost response here to reuse the same request."
              />
              <dl>
                {Object.entries(review)
                  .filter(
                    ([k]) =>
                      ![
                        "organizationId",
                        "id",
                        "requestKey",
                        "version",
                        "taskId",
                      ].includes(k),
                  )
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>
                        {{
                          operation: "Change",
                          name: "Name",
                          email: "Email",
                          phone: "Phone",
                          interest: "Interest",
                          contactAllowed: "Contact permission",
                          assigneeId: "Assigned staff",
                          stage: "Stage",
                          trialAt: "Trial time",
                          branchId: "Branch",
                          reason: "Reason",
                          action: "Planned action",
                          dueOn: "Due date",
                          joinedOn: "Joining date",
                          enrollment: "Membership",
                          sharedContactReason: "Shared contact explanation",
                        }[k] ?? k}
                      </dt>
                      <dd>
                        {k === "assigneeId"
                          ? (data.staff.find((s) => s.id === v)?.name ??
                            "Unassigned")
                          : k === "branchId"
                            ? data.branches.find((b) => b.id === v)?.name
                            : k === "stage"
                              ? labels[String(v)]
                              : k === "operation"
                                ? title
                                : k === "enrollment"
                                  ? (() => {
                                      const e = v as {
                                        mode: string;
                                        planVersionId?: string;
                                        startOn?: string;
                                      };
                                      const p = data.plans.find(
                                        (p) => p.id === e.planVersionId,
                                      );
                                      return e.mode === "later"
                                        ? "Register only, enroll later"
                                        : `${p?.name} · ${p ? exactMoney(p.amountMinor, p.currency) : ""} · ${e.startOn} to ${p && e.startOn ? endOn(e.startOn, p.durationCount, p.durationUnit) : ""} (end exclusive)`;
                                    })()
                                  : typeof v === "object"
                                    ? "None"
                                    : typeof v === "boolean"
                                      ? v
                                        ? "Yes"
                                        : "No"
                                      : String(v ?? "None")}
                      </dd>
                    </div>
                  ))}
              </dl>
              <div className={styles.actions}>
                <button
                  disabled={pending || attempted}
                  onClick={() => setReview(null)}
                >
                  Back
                </button>
                <button className="primary" disabled={pending} onClick={commit}>
                  {pending ? "Saving..." : "Save change"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
