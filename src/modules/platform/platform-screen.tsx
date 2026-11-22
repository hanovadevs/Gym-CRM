"use client";
import Link from "next/link";
import { feeStatus } from "./billing-labels";
import { exactMoney } from "@/modules/billing/format";
import Form from "next/form";
import { useState } from "react";
import { BrandMark } from "@/components/brand";
import { SignOut } from "@/components/sign-out";
import { SectionTitle } from "@/components/ui/section-title";
import { Drawer, Table, Pill } from "@/components/ui/primitives";
import type { PlatformData, PlatformGym } from "./service";
export function PlatformScreen({ initial }: { initial: PlatformData }) {
  const [data, setData] = useState(initial),
    [editing, setEditing] = useState<PlatformGym | "new" | null>(null),
    [accessChange, setAccessChange] = useState<boolean | undefined>(),
    [inspecting, setInspecting] = useState<PlatformGym | null>(null),
    [refreshing, setRefreshing] = useState(false),
    [refreshError, setRefreshError] = useState("");
  async function reload() {
    setRefreshing(true);
    setRefreshError("");
    try {
      const response = await fetch(
        href({}).replace("/admin?", "/api/platform?"),
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw Error(
          result.error?.message || "Unable to refresh the directory.",
        );
      setData(result.data);
    } catch (error) {
      setRefreshError(
        error instanceof Error
          ? error.message
          : "Unable to refresh the directory.",
      );
    } finally {
      setRefreshing(false);
    }
  }
  function href(changes: Record<string, string | number | undefined>) {
    const q: Record<string, string | number | undefined> = {
      search: data.search || undefined,
      page: data.page > 1 ? data.page : undefined,
      activityPage: data.activityPage > 1 ? data.activityPage : undefined,
      organizationId: data.organizationId,
      ...changes,
    };
    return (
      "/admin?" +
      new URLSearchParams(
        Object.entries(q)
          .filter(
            (entry): entry is [string, string | number] =>
              entry[1] !== undefined,
          )
          .map(([key, value]) => [key, String(value)]),
      ).toString()
    );
  }
  return (
    <div className="platform-layout">
      <header className="platform-header">
        <Link href="/admin" className="brand">
          <span className="brand-mark">
            <BrandMark />
          </span>
          Mojym
        </Link>
        <span>Platform administration</span>
        <SignOut />
      </header>
      <div className="platform-body">
        <aside className="platform-rail" aria-label="Platform navigation">
          <p className="eyebrow">Administration</p>
          <nav>
            <a href="#gym-directory">Gym workspaces</a>
            <a href="#gym-activity">Recorded activity</a>
          </nav>
          <section>
            <SectionTitle
              title="Platform access"
              help="Platform administrators manage workspace accounts. This does not grant access to a gym's private member profiles, notes or financial records."
            />
            <p>{data.userName}</p>
            <span>Workspace administration</span>
          </section>
        </aside>
        <main className="platform-main">
          <section className="page-heading">
            <div>
              <p className="eyebrow">{data.userName}</p>
              <h1>Your gym network</h1>
              <p>
                Create workspaces, manage access and review recorded activity.
              </p>
            </div>
            <div className="platform-heading-actions">
              <button
                onClick={reload}
                disabled={refreshing}
                aria-busy={refreshing}
              >
                {refreshing ? "RefreshingÃ¢â‚¬Â¦" : "Refresh directory"}
              </button>
              <button className="primary" onClick={() => setEditing("new")}>
                Create gym
              </button>
            </div>
          </section>
          {refreshError ? (
            <p role="alert" className="form-error">
              {refreshError}
            </p>
          ) : null}
          <div className="platform-overview">
            <section className="panel">
              <SectionTitle
                title="Gym directory"
                help="The number of gyms matching your current directory search, across every page."
              />
              <strong>{data.total}</strong>
              <span>
                {data.search
                  ? "Workspaces matching your search"
                  : "Registered gym workspaces"}
              </span>
            </section>
            <section className="panel">
              <SectionTitle
                title="Activity history"
                help="The total retained audit events for the selected gym, or all gyms when no activity filter is selected."
              />
              <strong>{data.activityTotal}</strong>
              <span>
                {data.organizationId
                  ? "Events for selected workspace"
                  : "Recorded events across your network"}
              </span>
            </section>
          </div>
          <section className="panel platform-directory" id="gym-directory">
            <SectionTitle
              title="Gym workspaces"
              help="Each gym has isolated members, billing and staff. Suspending a gym blocks staff access while retaining its records. Platform access is granted separately from gym ownership."
            />
            <Form action="/admin" className="platform-search">
              <label className="field">
                Find a gym
                <input
                  name="search"
                  defaultValue={data.search}
                  maxLength={100}
                  placeholder="Gym name or slug"
                />
              </label>
              <button type="submit">Search</button>
              {data.search ? (
                <Link href="/admin" className="text-action">
                  Clear
                </Link>
              ) : null}
            </Form>
            <Table caption="Gym directory">
              <thead>
                <tr>
                  <th>Gym</th>
                  <th>Status</th>
                  <th>Active members</th>
                  <th>Monthly fee</th>
                  <th>Staff / branches</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.gyms.map((gym) => (
                  <tr key={gym.id}>
                    <td>
                      <button
                        className="platform-gym-name text-action"
                        onClick={() => setInspecting(gym)}
                        aria-label={`View ${gym.name}`}
                      >
                        {gym.name}
                      </button>
                      <small>{gym.slug}</small>
                      {gym.email ? <small>{gym.email}</small> : null}
                    </td>
                    <td>
                      <Pill tone={gym.active ? "success" : "warning"}>
                        {gym.active ? "Active" : "Suspended"}
                      </Pill>
                    </td>
                    <td>{gym.members}</td>
                    <td>
                      <span>
                        {feeStatus[gym.billing?.status ?? "not_recorded"]}
                      </span>
                      {gym.billing?.currency &&
                      gym.billing.balanceMinor !== null ? (
                        <small>
                          {exactMoney(
                            gym.billing.balanceMinor,
                            gym.billing.currency,
                          )}{" "}
                          remaining
                        </small>
                      ) : null}
                    </td>
                    <td>
                      {gym.staff} / {gym.branches}
                    </td>
                    <td>
                      <div className="platform-row-actions">
                        <button
                          className="text-action"
                          onClick={() => {
                            setAccessChange(undefined);
                            setEditing(gym);
                          }}
                          aria-label={`Manage ${gym.name}`}
                        >
                          Manage
                        </button>
                        <Link href={"/admin/gyms/" + gym.id}>Analytics</Link>
                        <Link href={"/admin/gyms/" + gym.id + "/billing"}>
                          Monthly billing
                        </Link>
                        <button
                          className="text-action"
                          onClick={() => {
                            setAccessChange(!gym.active);
                            setEditing(gym);
                          }}
                          aria-label={`${gym.active ? "Suspend" : "Reactivate"} ${gym.name}`}
                        >
                          {gym.active ? "Suspend" : "Reactivate"}
                        </button>
                        <Link
                          href={href({
                            organizationId: gym.id,
                            activityPage: undefined,
                          })}
                        >
                          Activity
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {!data.gyms.length ? (
              <p className="platform-empty">
                {data.search
                  ? "No gyms match your search."
                  : "No gyms yet. Create the first workspace to get started."}
              </p>
            ) : null}
            <nav className="member-pagination" aria-label="Gym pages">
              <span>
                {data.total} gyms Ã‚Â· Page {data.page}
              </span>
              {data.page > 1 ? (
                <Link href={href({ page: data.page - 1 })}>Previous</Link>
              ) : null}
              {data.page * 15 < data.total ? (
                <Link href={href({ page: data.page + 1 })}>Next</Link>
              ) : null}
            </nav>
          </section>
          <section className="panel platform-activity" id="gym-activity">
            <div className="platform-section-heading">
              <SectionTitle
                title="Recorded activity"
                help="Audited gym and platform changes, newest first. This is recorded application activity, not a live visitor tracker. Passwords, private note bodies and payment details are excluded."
              />
              {data.organizationId ? (
                <Link
                  href={href({
                    organizationId: undefined,
                    activityPage: undefined,
                  })}
                >
                  Show all gyms
                </Link>
              ) : null}
            </div>
            <Table caption="Audited gym and platform activity">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Gym / actor</th>
                  <th>Action</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((event) => (
                  <tr key={event.source + event.id}>
                    <td>
                      <time dateTime={event.occurredAt}>
                        {new Date(event.occurredAt)
                          .toISOString()
                          .replace("T", " ")
                          .slice(0, 16)}{" "}
                        UTC
                      </time>
                    </td>
                    <td>
                      <strong>{event.gymName}</strong>
                      <small>{event.actor}</small>
                    </td>
                    <td>
                      <span>{event.action}</span>
                      <small>{event.source}</small>
                    </td>
                    <td>{event.reason}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {!data.events.length ? (
              <p className="platform-empty">
                No recorded activity for this selection.
              </p>
            ) : null}
            <nav className="member-pagination" aria-label="Activity pages">
              <span>
                {data.activityTotal} events Ã‚Â· Page {data.activityPage}
              </span>
              {data.activityPage > 1 ? (
                <Link href={href({ activityPage: data.activityPage - 1 })}>
                  Previous
                </Link>
              ) : null}
              {data.activityPage * 20 < data.activityTotal ? (
                <Link href={href({ activityPage: data.activityPage + 1 })}>
                  Next
                </Link>
              ) : null}
            </nav>
          </section>
        </main>
      </div>
      {inspecting ? (
        <Drawer
          title="Gym workspace details"
          onClose={() => setInspecting(null)}
        >
          <div className="platform-inspector">
            <p className="eyebrow">{inspecting.slug}</p>
            <h3>{inspecting.name}</h3>
            <Pill tone={inspecting.active ? "success" : "warning"}>
              {inspecting.active ? "Active" : "Suspended"}
            </Pill>
            <SectionTitle
              title="Gym contacts"
              help="Contact details maintained for this workspace. Owner credentials and private member data are never displayed here."
            />
            <dl>
              <dt>Gym login ID</dt>
              <dd>{inspecting.email || "Not provided"}</dd>
              <dt>Owner recovery email</dt>
              <dd>{inspecting.ownerEmail || "Not configured"}</dd>
              <dt>Phone</dt>
              <dd>{inspecting.phone || "Not provided"}</dd>
              <dt>Address</dt>
              <dd>{inspecting.address || "Not provided"}</dd>
              <dt>Created</dt>
              <dd>
                {new Date(inspecting.createdAt).toISOString().slice(0, 10)} UTC
              </dd>
            </dl>
            <SectionTitle
              title="Workspace footprint"
              help="Non-archived member, active staff and active branch counts from the last directory refresh. This view does not enter the gym workspace."
            />
            <dl>
              <dt>Active members</dt>
              <dd>{inspecting.members}</dd>
              <dt>Staff</dt>
              <dd>{inspecting.staff}</dd>
              <dt>Branches</dt>
              <dd>{inspecting.branches}</dd>
            </dl>
            <p>
              {inspecting.active
                ? "Staff can sign in according to their assigned roles and branches."
                : "Staff access is suspended. Existing records are retained."}
            </p>
            <div className="platform-heading-actions">
              <button
                className="primary"
                onClick={() => {
                  setAccessChange(undefined);
                  setEditing(inspecting);
                  setInspecting(null);
                }}
              >
                Manage workspace
              </button>
              <button
                onClick={() => {
                  setAccessChange(!inspecting.active);
                  setEditing(inspecting);
                  setInspecting(null);
                }}
              >
                {inspecting.active ? "Suspend gym" : "Reactivate gym"}
              </button>
              <Link href={"/admin/gyms/" + inspecting.id + "/billing"}>
                Monthly billing
              </Link>
              <Link href={"/admin/gyms/" + inspecting.id}>
                View gym analytics
              </Link>
              <Link
                href={
                  href({
                    organizationId: inspecting.id,
                    activityPage: undefined,
                  }) + "#gym-activity"
                }
                onClick={() => setInspecting(null)}
              >
                Review activity
              </Link>
            </div>
          </div>
        </Drawer>
      ) : null}
      {editing ? (
        <GymEditor
          gym={editing}
          accessChange={accessChange}
          onClose={() => {
            setEditing(null);
            setAccessChange(undefined);
          }}
          refresh={async () => {
            const response = await fetch(
              href({}).replace("/admin?", "/api/platform?"),
              { cache: "no-store" },
            );
            const result = await response.json();
            if (!response.ok || !result.ok)
              throw Error(
                "The change was saved, but the list could not refresh. Reload before making another change.",
              );
            setData(result.data);
          }}
        />
      ) : null}
    </div>
  );
}
function GymEditor({
  gym,
  accessChange,
  onClose,
  refresh,
}: {
  gym: PlatformGym | "new";
  accessChange?: boolean;
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const creating = gym === "new";
  const [requestKey] = useState(() => crypto.randomUUID()),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [reload, setReload] = useState(false),
    [retry, setRetry] = useState<Record<string, unknown> | null>(null);
  return (
    <Drawer
      title={
        creating
          ? "Create gym workspace"
          : accessChange === false
            ? "Suspend gym workspace"
            : accessChange === true
              ? "Reactivate gym workspace"
              : "Manage gym workspace"
      }
      onClose={onClose}
      busy={pending}
    >
      {saved ? (
        <section className="invoice-detail">
          <SectionTitle
            title="Workspace saved"
            help="The gym change and its audit record were committed together. No email was sent automatically."
          />

          <p>
            {creating
              ? "The gym and owner account are ready. Share the initial credentials securely; the owner can use password recovery to choose another password."
              : "The gym configuration was updated."}
          </p>
          {error ? (
            <p role="alert" className="form-error">
              {error}
            </p>
          ) : null}
          {reload ? (
            <button onClick={() => location.reload()}>Reload page</button>
          ) : (
            <button className="primary" onClick={onClose}>
              Done
            </button>
          )}
        </section>
      ) : (
        <form
          className="invoice-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending || reload) return;
            const form = new FormData(event.currentTarget);
            const payload = retry ?? {
              operation: creating ? "create" : "update",
              requestKey,
              name: String(form.get("name")),
              email: String(form.get("email")),
              ownerEmail: String(form.get("ownerEmail")),
              phone: String(form.get("phone")),
              address: String(form.get("address")),
              reason: String(form.get("reason")),
              ...(creating
                ? {
                    slug: String(form.get("slug")),
                    ownerName: String(form.get("ownerName")),
                    password: String(form.get("password")),
                  }
                : {
                    organizationId: gym.id,
                    version: gym.version,
                    active: form.get("active") === "true",
                  }),
            };
            setPending(true);
            setError("");
            setRetry(payload);
            try {
              const response = await fetch("/api/platform", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              const result = await response.json();
              if (!response.ok || !result.ok) {
                if (response.status === 422) setRetry(null);
                else if (response.status === 409 || response.status === 403)
                  setReload(true);
                throw Error(
                  result.error?.message ?? "Could not save the workspace.",
                );
              }
              setSaved(true);
              setRetry(null);
              try {
                await refresh();
              } catch (error) {
                setReload(true);
                setError(
                  error instanceof Error
                    ? error.message
                    : "Reload to see the saved change.",
                );
              }
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Could not reach the server. Retry sends the same request safely.",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <SectionTitle
            title={creating ? "Gym and owner" : "Workspace access"}
            help={
              creating
                ? "Creates one isolated gym, main branch and owner login atomically. Public registration stays disabled. No initial password is retained in the activity log."
                : "Suspension retains all records and staff assignments. Reactivation restores access for staff who still have active membership and branch grants."
            }
          />
          {accessChange !== undefined ? (
            <p className="analytics-notice">
              {accessChange
                ? "Confirm reactivation to restore access for staff whose memberships and branch grants remain active."
                : "Confirm suspension to block all gym staff operations, including existing sessions on their next request. Member, invoice and payment records will be retained. Membership dates continue unchanged."}{" "}
              Add a reason before confirming.
            </p>
          ) : null}
          <fieldset disabled={pending || !!retry || reload}>
            <label>
              Gym name
              <input
                name="name"
                defaultValue={creating ? "" : gym.name}
                required
                maxLength={100}
              />
            </label>
            <label>
              Gym login email
              <input
                name="email"
                type="email"
                defaultValue={creating ? "" : gym.email}
                required={creating}
                readOnly={!creating}
              />
            </label>
            <p className="support">
              This is the gym login ID. It may be a made-up email and is never
              used as a delivery address.
            </p>
            <label>
              Owner recovery email
              <input
                name="ownerEmail"
                type="email"
                required={creating}
                defaultValue={creating ? "" : (gym.ownerEmail ?? "")}
                maxLength={254}
                autoComplete="email"
              />
            </label>
            <p className="support">
              Use the owner&apos;s real email for password recovery, fee reminders
              and account notifications. It is separate from the login ID.
            </p>
            <label>
              Gym contact number
              <input
                name="phone"
                type="tel"
                maxLength={40}
                defaultValue={creating ? "" : gym.phone}
              />
            </label>
            <label>
              Gym address
              <textarea
                name="address"
                maxLength={500}
                rows={3}
                defaultValue={creating ? "" : gym.address}
              />
            </label>
            {creating ? (
              <>
                <label>
                  Gym slug
                  <input
                    name="slug"
                    required
                    maxLength={80}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    autoCapitalize="none"
                    placeholder="northside-fitness"
                  />
                </label>
                <label>
                  Owner name
                  <input
                    name="ownerName"
                    required
                    maxLength={100}
                    autoComplete="name"
                  />
                </label>
                <label>
                  Initial gym password
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </label>
              </>
            ) : (
              <label>
                {accessChange !== undefined ? (
                  <input
                    type="hidden"
                    name="active"
                    value={String(accessChange)}
                  />
                ) : null}
                Workspace access
                <select
                  name="active"
                  aria-label="Workspace access"
                  disabled={accessChange !== undefined}
                  defaultValue={String(accessChange ?? gym.active)}
                >
                  <option value="true">Active</option>
                  <option value="false">Suspended</option>
                </select>
              </label>
            )}
            <label>
              Reason
              <textarea
                name="reason"
                required
                minLength={3}
                maxLength={300}
                rows={3}
              />
            </label>
          </fieldset>
          {error ? (
            <p role="alert" className="form-error">
              {error}
            </p>
          ) : null}
          {retry && !pending && !reload ? (
            <p>Your submitted values are kept for a safe retry.</p>
          ) : null}
          {reload ? (
            <button type="button" onClick={() => location.reload()}>
              Reload page
            </button>
          ) : (
            <button className="primary" type="submit" disabled={pending}>
              {pending
                ? "SavingÃ¢â‚¬Â¦"
                : retry
                  ? "Retry saved request"
                  : creating
                    ? "Create gym and owner"
                    : accessChange === false
                      ? "Confirm suspension"
                      : accessChange === true
                        ? "Confirm reactivation"
                        : "Save workspace"}
            </button>
          )}
        </form>
      )}
    </Drawer>
  );
}
