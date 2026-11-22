"use client";
import Link from "next/link";
import Form from "next/form";
import { useState } from "react";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { Drawer, Table, Pill } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/section-title";
import { useHydrated } from "@/lib/use-hydrated";
import type { Trainer, TrainingDirectory } from "./types";
export function TrainersScreen({ initial }: { initial: TrainingDirectory }) {
  const [data, setData] = useState(initial),
    [editing, setEditing] = useState<Trainer | "new" | null>(null),
    [view, setView] = useState<Trainer | null>(null),
    [error, setError] = useState("");
  const hydrated = useHydrated();
  const query = new URLSearchParams({
    organizationId: data.organizationId,
    branchId: data.branchId,
    q: data.q,
    page: String(data.page),
  });
  async function refresh() {
    const r = await fetch("/api/trainers?" + query, { cache: "no-store" });
    const v = await r.json();
    if (!r.ok || !v.ok)
      throw Error(
        "The profile was saved, but the directory could not refresh. Reload before another change.",
      );
    setData(v.data);
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
      <section className="page-heading">
        <div>
          <h1>Trainers</h1>
          <p>Coaching profiles and branch assignments.</p>
        </div>
        {data.canManage ? (
          <button
            className="primary"
            disabled={!hydrated || !!error}
            onClick={() => setEditing("new")}
          >
            Add trainer
          </button>
        ) : null}
      </section>
      {error ? (
        <p role="alert" className="form-error">
          {error}{" "}
          <button onClick={() => location.reload()}>Reload trainers</button>
        </p>
      ) : null}
      <section className="panel">
        <SectionTitle
          title="Trainer directory"
          help="Profiles are separate from staff sign-in accounts. Inactive trainers stay in history; resolve upcoming sessions before deactivating them. Trainer accounts can view only their own linked profile."
        />
        <Form action="/trainers" className="trainer-filters">
          <input
            type="hidden"
            name="organizationId"
            value={data.organizationId}
          />
          <label>
            Find trainer
            <input
              name="q"
              defaultValue={data.q}
              placeholder="Name or specialty"
              maxLength={100}
            />
          </label>
          <label>
            Branch
            <select name="branchId" defaultValue={data.branchId}>
              <option value="">All authorized branches</option>
              {data.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Search</button>
        </Form>
        <Table caption="Gym trainers">
          <thead>
            <tr>
              <th>Trainer</th>
              <th>Specialties</th>
              <th>Branches</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.name}</strong>
                  {!data.own ? (
                    <small className="table-secondary">
                      {t.email || t.phone || "No contact supplied"}
                    </small>
                  ) : null}
                </td>
                <td>{t.specialties || "Not specified"}</td>
                <td>{t.branches.map((b) => b.name).join(", ")}</td>
                <td>
                  <Pill tone={t.active ? "success" : "warning"}>
                    {t.active ? "Active" : "Inactive"}
                  </Pill>
                </td>
                <td>
                  <button className="text-action" onClick={() => setView(t)}>
                    View {t.name}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!data.rows.length ? (
          <p className="empty-state">
            {data.own
              ? "No trainer profile is linked to your account. Ask your gym administrator."
              : "No trainers match this selection. Add a coaching profile to get started."}
          </p>
        ) : null}
        <nav className="pagination" aria-label="Trainer pages">
          <span>
            {data.total} trainers / Page {data.page}
          </span>
          {data.page > 1 ? (
            <Link
              href={
                "/trainers?" +
                new URLSearchParams({
                  ...Object.fromEntries(query),
                  page: String(data.page - 1),
                })
              }
            >
              Previous
            </Link>
          ) : null}
          {data.page * 25 < data.total ? (
            <Link
              href={
                "/trainers?" +
                new URLSearchParams({
                  ...Object.fromEntries(query),
                  page: String(data.page + 1),
                })
              }
            >
              Next
            </Link>
          ) : null}
        </nav>
      </section>
      {view ? (
        <Drawer title={view.name} onClose={() => setView(null)}>
          <SectionTitle
            title="Coaching profile"
            help="Profile details apply to this gym. Sign-in access is controlled separately in Settings."
          />
          <dl className="review-list">
            <dt>Specialties</dt>
            <dd>{view.specialties || "Not specified"}</dd>
            <dt>Branches</dt>
            <dd>{view.branches.map((b) => b.name).join(", ")}</dd>
            <dt>Status</dt>
            <dd>{view.active ? "Active" : "Inactive"}</dd>
            {!data.own ? (
              <>
                <dt>Email</dt>
                <dd>{view.email || "Not provided"}</dd>
                <dt>Phone</dt>
                <dd>{view.phone || "Not provided"}</dd>
                <dt>Staff account</dt>
                <dd>
                  {view.loginUserId
                    ? "Linked trainer sign-in"
                    : "No linked sign-in"}
                </dd>
              </>
            ) : null}
          </dl>
          <div className="platform-heading-actions">
            <Link
              href={
                "/classes?" +
                new URLSearchParams({
                  organizationId: data.organizationId,
                  trainerId: view.id,
                })
              }
            >
              Availability & classes
            </Link>
            {data.canManage ? (
              <Link
                href={
                  "/employees?" +
                  new URLSearchParams({
                    organizationId: data.organizationId,
                    ...(view.employeeId
                      ? { employeeId: view.employeeId }
                      : { q: view.name }),
                  })
                }
              >
                Employee & salary profile
              </Link>
            ) : null}
          </div>
          {data.canManage && view.canEdit ? (
            <button
              className="primary"
              disabled={!!error}
              onClick={() => {
                setEditing(view);
                setView(null);
              }}
            >
              Edit trainer
            </button>
          ) : null}
          {data.canManage && !view.canEdit ? (
            <p>
              Access to every assigned branch is required to edit this trainer.
            </p>
          ) : null}
        </Drawer>
      ) : null}
      {editing ? (
        <TrainerEditor
          data={data}
          trainer={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          saved={async () => {
            try {
              await refresh();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Reload the directory.",
              );
              throw e;
            }
          }}
        />
      ) : null}
    </WorkspaceFrame>
  );
}
function TrainerEditor({
  data,
  trainer,
  onClose,
  saved,
}: {
  data: TrainingDirectory;
  trainer?: Trainer;
  onClose: () => void;
  saved: () => Promise<void>;
}) {
  const [key] = useState(() => crypto.randomUUID()),
    [id] = useState(() => trainer?.id ?? crypto.randomUUID()),
    [body, setBody] = useState<Record<string, unknown> | null>(null),
    [attempted, setAttempted] = useState(false),
    [pending, setPending] = useState(false),
    [done, setDone] = useState(false),
    [blocked, setBlocked] = useState(false),
    [error, setError] = useState("");
  async function confirm() {
    if (!body || pending || blocked) return;
    setPending(true);
    setAttempted(true);
    setError("");
    try {
      const r = await fetch("/api/trainers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const v = await r.json();
      if (!r.ok || !v.ok) {
        if (r.status === 409 || r.status === 403) setBlocked(true);
        else if (r.status === 422) {
          setBody(null);
          setAttempted(false);
        }
        throw Error(v.error?.message ?? "Unable to save trainer.");
      }
      setDone(true);
      await saved();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to reach the server. Retry this same request.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Drawer
      title={trainer ? "Edit trainer" : "Add trainer"}
      onClose={onClose}
      busy={pending}
    >
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {done ? (
        <section>
          <h3>Trainer saved</h3>
          <p>
            The profile, branch assignments and audit record were saved
            together.
          </p>
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </section>
      ) : (
        <>
          <form
            className="invoice-form"
            hidden={!!body}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setError("");
              setBody({
                organizationId: data.organizationId,
                id,
                requestKey: key,
                ...(trainer ? { version: trainer.version } : {}),
                name: f.get("name"),
                specialties: f.get("specialties"),
                phone: f.get("phone"),
                email: f.get("email"),
                loginUserId: f.get("loginUserId") || null,
                branchIds: f.getAll("branchIds"),
                active: f.get("active") === "on",
                reason: f.get("reason"),
              });
            }}
          >
            <label>
              Full name
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={trainer?.name}
              />
            </label>
            <label>
              Specialties
              <input
                name="specialties"
                maxLength={200}
                defaultValue={trainer?.specialties}
              />
            </label>
            <label>
              Phone
              <input
                name="phone"
                type="tel"
                maxLength={50}
                defaultValue={trainer?.phone}
              />
            </label>
            <label>
              Email
              <input
                name="email"
                type="email"
                maxLength={254}
                defaultValue={trainer?.email}
              />
            </label>
            <label>
              Staff sign-in
              <select
                name="loginUserId"
                aria-label="Staff sign-in"
                defaultValue={trainer?.loginUserId ?? ""}
              >
                <option value="">No linked sign-in</option>
                {trainer?.loginUserId &&
                !data.logins.some((u) => u.id === trainer.loginUserId) ? (
                  <option value={trainer.loginUserId}>
                    Current linked account (unavailable)
                  </option>
                ) : null}
                {data.logins.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Optional: link an existing active trainer account with access to
              every selected branch. Create sign-in accounts in Settings.
            </p>
            <fieldset>
              <legend>Assigned branches</legend>
              {data.branches.map((b) => (
                <label className="check" key={b.id}>
                  <input
                    type="checkbox"
                    name="branchIds"
                    value={b.id}
                    defaultChecked={
                      trainer
                        ? trainer.branches.some((x) => x.id === b.id)
                        : data.branchId === b.id || data.branches.length === 1
                    }
                  />
                  {b.name}
                </label>
              ))}
            </fieldset>
            <label className="check">
              <input
                type="checkbox"
                name="active"
                defaultChecked={trainer?.active ?? true}
              />
              Active trainer
            </label>
            <label>
              Reason
              <input name="reason" required minLength={3} maxLength={300} />
            </label>
            <p>
              This profile does not create a staff login or send an invitation.
            </p>
            <button className="primary" type="submit">
              Review trainer
            </button>
          </form>
          {body ? (
            <section>
              <h3>Review trainer</h3>
              <dl className="review-list">
                <dt>Name</dt>
                <dd>{String(body.name)}</dd>
                <dt>Specialties</dt>
                <dd>{String(body.specialties) || "Not specified"}</dd>
                <dt>Branches</dt>
                <dd>
                  {data.branches
                    .filter((b) => (body.branchIds as string[]).includes(b.id))
                    .map((b) => b.name)
                    .join(", ") || "Select at least one branch"}
                </dd>
                <dt>Status</dt>
                <dd>{body.active ? "Active" : "Inactive"}</dd>
                <dt>Reason</dt>
                <dd>{String(body.reason)}</dd>
              </dl>
              <button
                className="primary"
                disabled={pending || blocked}
                onClick={confirm}
              >
                {pending
                  ? "Saving..."
                  : attempted
                    ? "Retry save"
                    : "Confirm trainer"}
              </button>
              {!attempted ? (
                <button onClick={() => setBody(null)}>Back to edit</button>
              ) : null}
              {blocked ? (
                <p>
                  Reload and review current branch permissions and trainer
                  details before another change.
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </Drawer>
  );
}
