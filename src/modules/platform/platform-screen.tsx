"use client";
import Link from "next/link";
import Form from "next/form";
import { useState } from "react";
import { BrandMark } from "@/components/brand";
import { SignOut } from "@/components/sign-out";
import { SectionTitle } from "@/components/ui/section-title";
import { Drawer, Table, Pill } from "@/components/ui/primitives";
import type { PlatformData, PlatformGym } from "./service";
export function PlatformScreen({ initial }: { initial: PlatformData }) {
  const [data, setData] = useState(initial),
    [editing, setEditing] = useState<PlatformGym | "new" | null>(null);
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
      <main className="platform-main">
        <section className="page-heading">
          <div>
            <p className="eyebrow">{data.userName}</p>
            <h1>Your gym network</h1>
            <p>
              Create workspaces, manage access and review recorded activity.
            </p>
          </div>
          <button className="primary" onClick={() => setEditing("new")}>
            Create gym
          </button>
        </section>
        <section className="panel platform-directory">
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
                <th>Members</th>
                <th>Staff / branches</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.gyms.map((gym) => (
                <tr key={gym.id}>
                  <td>
                    <strong>{gym.name}</strong>
                    <small>{gym.slug}</small>
                  </td>
                  <td>
                    <Pill tone={gym.active ? "success" : "warning"}>
                      {gym.active ? "Active" : "Suspended"}
                    </Pill>
                  </td>
                  <td>{gym.members}</td>
                  <td>
                    {gym.staff} / {gym.branches}
                  </td>
                  <td>
                    <div className="platform-row-actions">
                      <button
                        className="text-action"
                        onClick={() => setEditing(gym)}
                        aria-label={`Manage ${gym.name}`}
                      >
                        Manage
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
              {data.total} gyms · Page {data.page}
            </span>
            {data.page > 1 ? (
              <Link href={href({ page: data.page - 1 })}>Previous</Link>
            ) : null}
            {data.page * 15 < data.total ? (
              <Link href={href({ page: data.page + 1 })}>Next</Link>
            ) : null}
          </nav>
        </section>
        <section className="panel platform-activity">
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
              {data.activityTotal} events · Page {data.activityPage}
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
      {editing ? (
        <GymEditor
          gym={editing}
          onClose={() => setEditing(null)}
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
  onClose,
  refresh,
}: {
  gym: PlatformGym | "new";
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
      title={creating ? "Create gym workspace" : "Manage gym workspace"}
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
              phone: String(form.get("phone")),
              address: String(form.get("address")),
              reason: String(form.get("reason")),
              ...(creating
                ? {
                    slug: String(form.get("slug")),
                    ownerName: String(form.get("ownerName")),
                    ownerEmail: String(form.get("ownerEmail")),
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
              Gym email
              <input
                name="email"
                type="email"
                defaultValue={creating ? "" : gym.email}
              />
            </label>
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
                  Owner email
                  <input
                    name="ownerEmail"
                    type="email"
                    required
                    autoComplete="username"
                  />
                </label>
                <label>
                  Initial owner password
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
                Workspace access
                <select
                  name="active"
                  aria-label="Workspace access"
                  defaultValue={String(gym.active)}
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
                ? "Saving…"
                : retry
                  ? "Retry saved request"
                  : creating
                    ? "Create gym and owner"
                    : "Save workspace"}
            </button>
          )}
        </form>
      )}
    </Drawer>
  );
}
