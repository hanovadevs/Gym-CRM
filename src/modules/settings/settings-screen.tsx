"use client";
import { useState } from "react";
import { SectionTitle } from "@/components/ui/section-title";
import { Drawer } from "@/components/ui/primitives";
import { SignOut } from "@/components/sign-out";
import { AppSidebar } from "@/components/app-sidebar";
import type { SettingsData, Staff, Branch } from "./types";
import type { SettingsValues } from "./schemas";
const labels: Record<keyof SettingsValues, string> = {
  name: "Gym name",
  phone: "Phone",
  email: "Gym email",
  address: "Address",
  currency: "Currency",
  timeZone: "Time zone",
  locale: "Locale",
  receiptPrefix: "Receipt prefix",
  receiptFooter: "Receipt footer",
  graceDays: "Expiry grace (days)",
  debtBlocksAccess: "Block access for outstanding debt",
  paidActivation: "Require payment before initial activation",
};
export function SettingsScreen({ initial }: { initial: SettingsData }) {
  const [data, setData] = useState(initial),
    [tab, setTab] = useState("General"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false),
    [editor, setEditor] = useState<
      | { kind: "staff"; record?: Staff }
      | { kind: "branch"; record?: Branch }
      | null
    >(null);
  const [draft, setDraft] = useState(initial.values);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [staffDelivery, setStaffDelivery] = useState("password");
  async function reload(staffPage = data.staffPage) {
    const response = await fetch(
      "/api/settings?organizationId=" +
        data.organizationId +
        "&staffPage=" +
        staffPage,
      { cache: "no-store" },
    );
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error?.message ?? "Could not reload settings.");
    setData(result.data);
    setDraft(result.data.values);
    setReloadRequired(false);
  }
  async function send(path: string, method: string, body: unknown) {
    if (reloadRequired) return false;
    setError("");
    setMessage("");
    setPending(true);
    let committed = false;
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message ?? "Could not save. Try again.");
      committed = true;
      await reload();
      setMessage(
        result.data.deliveryStatus
          ? result.data.deliveryStatus === "sent"
            ? "Staff saved. Invitation accepted by the mail server."
            : `Staff saved. Invitation delivery: ${result.data.deliveryStatus}. Check the staff row before retrying.`
          : "Changes saved.",
      );
      setEditor(null);
      return true;
    } catch (e) {
      if (committed) {
        setReloadRequired(true);
        setEditor(null);
        setMessage("Changes saved.");
        setError(
          "Could not refresh the saved records. Reload latest before editing again.",
        );
        return false;
      }
      setError(
        e instanceof Error
          ? e instanceof TypeError
            ? "Could not reach the server. Your inputs are kept."
            : e.message
          : "Could not reach the server. Your inputs are kept.",
      );
      return false;
    } finally {
      setPending(false);
    }
  }
  const owner = data.canManageStaff;
  function exampleAmount() {
    try {
      return new Intl.NumberFormat(draft.locale || "en-PK", {
        style: "currency",
        currency: draft.currency,
      }).format(4500);
    } catch {
      return "4,500 (" + draft.currency + ")";
    }
  }
  function control(key: keyof SettingsValues) {
    const value = draft[key],
      disabled =
        !data.editableFields.includes(key) || pending || reloadRequired;
    return (
      <label className="settings-field" key={key}>
        <span>{labels[key]}</span>
        {typeof value === "boolean" ? (
          <input
            aria-label={labels[key]}
            type="checkbox"
            checked={value}
            disabled={disabled}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
          />
        ) : key === "currency" ? (
          <select
            aria-label={labels[key]}
            value={value}
            disabled={disabled}
            onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
          >
            {[
              ...new Set([
                data.values.currency,
                "PKR",
                "USD",
                "GBP",
                "AED",
                "EUR",
              ]),
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        ) : key === "receiptFooter" || key === "address" ? (
          <textarea
            aria-label={labels[key]}
            rows={key === "address" ? 3 : 2}
            value={String(value)}
            disabled={disabled}
            maxLength={key === "address" ? 500 : 240}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          />
        ) : (
          <input
            aria-label={labels[key]}
            type={
              key === "graceDays"
                ? "number"
                : key === "email"
                  ? "email"
                  : "text"
            }
            value={value}
            disabled={disabled}
            min={key === "graceDays" ? 0 : undefined}
            max={key === "graceDays" ? 30 : undefined}
            required={["name", "timeZone", "locale", "receiptPrefix"].includes(
              key,
            )}
            maxLength={
              key === "receiptPrefix" ? 12 : key === "phone" ? 40 : 100
            }
            onChange={(e) =>
              setDraft({
                ...draft,
                [key]:
                  key === "graceDays" ? Number(e.target.value) : e.target.value,
              })
            }
          />
        )}
      </label>
    );
  }
  return (
    <div className="settings-layout">
      <AppSidebar
        organization={{ id: data.organizationId, name: data.values.name }}
        active="settings"
        canManageSettings
        canReadBilling
      />
      <div className="settings-content">
        <header className="settings-topbar">
          <a href={"/workspace?organizationId=" + data.organizationId}>
            Back to workspace
          </a>
          <SignOut />
        </header>
        <main className="settings-main">
          <div className="page-heading">
            <div>
              <h1>Settings</h1>
              <p>Configure your gym and control staff access.</p>
            </div>
            {tab === "General" ? (
              <button
                className="primary"
                type="submit"
                form="gym-settings"
                disabled={pending || reloadRequired}
              >
                {pending ? "Saving…" : "Save changes"}
              </button>
            ) : null}
          </div>
          <div
            className="settings-tabs"
            role="tablist"
            aria-label="Settings sections"
            onKeyDown={(event) => {
              const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
              if (!keys.includes(event.key)) return;
              event.preventDefault();
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                ),
              );
              const index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (index +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        buttons.length) %
                      buttons.length;
              buttons[next]?.click();
              buttons[next]?.focus();
            }}
          >
            {[
              "General",
              ...(owner ? ["Branches", "Team & roles", "Activity"] : []),
            ].map((name) => (
              <button
                type="button"
                role="tab"
                key={name}
                id={"tab-" + name.replaceAll(" ", "-")}
                aria-selected={tab === name}
                aria-controls="settings-panel"
                tabIndex={tab === name ? 0 : -1}
                disabled={pending}
                onClick={() => {
                  if (
                    name !== tab &&
                    tab === "General" &&
                    data.editableFields.some(
                      (key) =>
                        draft[key as keyof SettingsValues] !==
                        data.values[key as keyof SettingsValues],
                    )
                  ) {
                    setError(
                      "Save or discard your general settings before switching sections.",
                    );
                    return;
                  }
                  setTab(name);
                  if (!reloadRequired) {
                    setError("");
                    setMessage("");
                  }
                }}
              >
                {name}
              </button>
            ))}
          </div>
          {error && !editor ? (
            <div className="form-error" role="alert">
              {error}{" "}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setPending(true);
                  reload()
                    .then(() => {
                      setError("");
                      setMessage("Latest records loaded.");
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setPending(false));
                }}
              >
                Reload latest
              </button>
            </div>
          ) : null}
          {message ? (
            <p className="form-message" role="status">
              {message}
            </p>
          ) : null}
          <div
            id="settings-panel"
            role="tabpanel"
            aria-labelledby={"tab-" + tab.replaceAll(" ", "-")}
          >
            {tab === "General" ? (
              <form
                id="gym-settings"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  const changes: Partial<SettingsValues> = {};
                  for (const key of data.editableFields as (keyof SettingsValues)[])
                    if (draft[key] !== data.values[key])
                      Object.assign(changes, { [key]: draft[key] });
                  if (!Object.keys(changes).length) {
                    setMessage("No changes to save.");
                    return;
                  }
                  await send("/api/settings", "PATCH", {
                    organizationId: data.organizationId,
                    version: data.version,
                    changes,
                    reason: String(form.get("reason")),
                  });
                }}
              >
                <div className="settings-columns">
                  <div className="settings-column">
                    <section className="panel">
                      <SectionTitle
                        title="Gym details"
                        help="Your saved gym name appears in staff workspaces. Contact details are organization-wide. Owners control branding; managers may maintain contact details."
                      />
                      <div className="gym-mark" aria-label="Gym initials">
                        {draft.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((w) => w[0])
                          .join("")
                          .toUpperCase()}
                      </div>
                      {(["name", "phone", "email", "address"] as const).map(
                        control,
                      )}
                    </section>
                    <section className="panel">
                      <SectionTitle
                        title="Preferences"
                        help="Currency, locale and time zone are saved on the organization and used for workspace context and formatting. Financial amounts are never converted automatically."
                      />
                      {(["currency", "timeZone", "locale"] as const).map(
                        control,
                      )}
                    </section>
                  </div>
                  <div className="settings-column">
                    <section className="panel">
                      <SectionTitle
                        title="Member access rules"
                        help="Owners configure policy here. These saved policies will be consumed by the enrollment and attendance services when those modules are connected. Default expiry grace is zero days."
                      />
                      {(
                        [
                          "paidActivation",
                          "debtBlocksAccess",
                          "graceDays",
                        ] as const
                      ).map(control)}
                    </section>
                    <section className="panel">
                      <SectionTitle
                        title="Receipts"
                        help="The prefix and footer are saved for receipt generation. This formatting example is not a receipt or evidence of a payment. Receipt numbering will remain atomic in the billing service."
                      />
                      {(["receiptPrefix", "receiptFooter"] as const).map(
                        control,
                      )}
                      <div className="receipt-example">
                        <strong>{draft.name}</strong>
                        <p>{draft.receiptPrefix}-000001</p>
                        <p>{exampleAmount()}</p>
                        <p>{draft.receiptFooter}</p>
                        <small>Formatting example</small>
                      </div>
                    </section>
                  </div>
                </div>
                <section className="panel settings-reason">
                  <label className="field">
                    Reason for change
                    <input
                      name="reason"
                      required
                      minLength={3}
                      maxLength={300}
                      placeholder="Briefly explain this change"
                      disabled={pending || reloadRequired}
                    />
                  </label>
                  <div className="settings-form-actions">
                    <button
                      type="button"
                      disabled={pending || reloadRequired}
                      onClick={() => {
                        setDraft(data.values);
                        setError("");
                        setMessage("Unsaved changes discarded.");
                      }}
                    >
                      Discard changes
                    </button>
                    <button
                      className="primary"
                      disabled={pending || reloadRequired}
                      type="submit"
                    >
                      {pending ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </section>
              </form>
            ) : null}
            {tab === "Branches" ? (
              <section className="panel">
                <div className="panel-heading">
                  <SectionTitle
                    title="Branches"
                    help="Branch codes are unique within your gym. Deactivating a branch removes it from staff access immediately. At least one active branch must remain."
                  />
                  <button
                    className="primary"
                    disabled={pending || reloadRequired}
                    onClick={() => {
                      setError("");
                      setEditor({ kind: "branch" });
                    }}
                  >
                    Add branch
                  </button>
                </div>
                <div className="table-scroll">
                  <table>
                    <caption className="sr-only">Gym branches</caption>
                    <thead>
                      <tr>
                        <th>Branch</th>
                        <th>Code</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.branches.map((branch) => (
                        <tr key={branch.id}>
                          <td>{branch.name}</td>
                          <td>{branch.code}</td>
                          <td>{branch.active ? "Active" : "Inactive"}</td>
                          <td>
                            <button
                              disabled={pending || reloadRequired}
                              onClick={() => {
                                setError("");
                                setEditor({ kind: "branch", record: branch });
                              }}
                            >
                              Edit {branch.name}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
            {tab === "Team & roles" ? (
              <section className="panel">
                <div className="panel-heading">
                  <SectionTitle
                    title="Team & roles"
                    help="Only owners can add staff or change roles and branch grants. Choose an initial password or email a one-use password setup link from contact@hanovadevs.com. Existing accounts cannot be claimed or reset here. At least one active owner must remain."
                  />
                  <button
                    className="primary"
                    disabled={pending || reloadRequired}
                    onClick={() => {
                      setError("");
                      setEditor({ kind: "staff" });
                    }}
                  >
                    Add staff
                  </button>
                </div>
                <div className="table-scroll">
                  <table>
                    <caption className="sr-only">Staff access</caption>
                    <thead>
                      <tr>
                        <th>Staff member</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Branches</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.staff.map((staff) => (
                        <tr key={staff.id}>
                          <td>
                            <strong>{staff.name}</strong>
                            <span className="cell-secondary">
                              {staff.email}
                            </span>
                            {staff.invitationStatus ? (
                              <span className="cell-secondary">
                                Invitation: {staff.invitationStatus}
                              </span>
                            ) : null}
                          </td>
                          <td className="role-name">{staff.role}</td>
                          <td>{staff.active ? "Active" : "Inactive"}</td>
                          <td>
                            {staff.role === "owner"
                              ? "All active branches"
                              : staff.branchIds
                                  .map(
                                    (id) =>
                                      data.branches.find((b) => b.id === id)
                                        ?.name ?? "Unavailable",
                                  )
                                  .join(", ") || "No grants"}
                          </td>
                          <td>
                            <button
                              disabled={pending || reloadRequired}
                              onClick={() => {
                                setError("");
                                setEditor({ kind: "staff", record: staff });
                              }}
                            >
                              Edit access for {staff.name}
                            </button>
                            {staff.active &&
                            staff.invitationId &&
                            ["pending", "failed"].includes(
                              staff.invitationStatus ?? "",
                            ) ? (
                              <button
                                disabled={pending || reloadRequired}
                                onClick={() =>
                                  send("/api/staff/mail", "POST", {
                                    organizationId: data.organizationId,
                                    mailId: staff.invitationId,
                                  })
                                }
                              >
                                Retry invitation for {staff.name}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="staff-pagination">
                  <span>
                    {data.staffTotal} staff / Page {data.staffPage} of{" "}
                    {Math.max(1, Math.ceil(data.staffTotal / 25))}
                  </span>
                  <button
                    type="button"
                    disabled={pending || data.staffPage <= 1 || reloadRequired}
                    onClick={() => {
                      setPending(true);
                      reload(data.staffPage - 1)
                        .catch((e) => setError(e.message))
                        .finally(() => setPending(false));
                    }}
                  >
                    Previous staff page
                  </button>
                  <button
                    type="button"
                    disabled={
                      pending ||
                      data.staffPage * 25 >= data.staffTotal ||
                      reloadRequired
                    }
                    onClick={() => {
                      setPending(true);
                      reload(data.staffPage + 1)
                        .catch((e) => setError(e.message))
                        .finally(() => setPending(false));
                    }}
                  >
                    Next staff page
                  </button>
                </div>
              </section>
            ) : null}
            {tab === "Activity" ? (
              <section className="panel">
                <SectionTitle
                  title="Administrative activity"
                  help="Every saved settings, staff and branch change records who changed it and why. Entries cannot be edited through the app. This list shows the most recent 20 changes."
                />
                {data.audit.length ? (
                  <ol className="audit-list">
                    {data.audit.map((event) => (
                      <li key={event.id}>
                        <strong>
                          {(
                            {
                              "organization.bootstrap": "Workspace initialized",
                              "settings.updated": "Settings updated",
                              "staff.access_changed": "Staff access changed",
                              "staff.provisioned": "Staff account created",
                              "branch.updated": "Branch updated",
                              "branch.created": "Branch created",
                            } as Record<string, string>
                          )[event.action] ?? "Administrative change"}
                        </strong>
                        <p>{event.reason}</p>
                        <p className="support">By {event.actorName}</p>
                        <time dateTime={event.occurredAt}>
                          {new Intl.DateTimeFormat(data.values.locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: data.values.timeZone,
                          }).format(new Date(event.occurredAt))}
                        </time>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="empty">
                    No administrative changes recorded yet.
                  </p>
                )}
              </section>
            ) : null}
          </div>
        </main>
      </div>
      {editor ? (
        <Drawer
          busy={pending}
          title={
            editor.kind === "staff"
              ? editor.record
                ? "Edit staff access"
                : "Add staff"
              : editor.record
                ? "Edit branch"
                : "Add branch"
          }
          onClose={() => {
            if (!pending) setEditor(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const common = {
                organizationId: data.organizationId,
                reason: String(form.get("reason")),
              };
              if (editor.kind === "branch") {
                await send("/api/branches", editor.record ? "PATCH" : "POST", {
                  ...common,
                  ...(editor.record
                    ? { id: editor.record.id, version: editor.record.version }
                    : {}),
                  name: String(form.get("name")),
                  code: String(form.get("code")),
                  active: form.has("active"),
                });
              } else {
                await send("/api/staff", editor.record ? "PATCH" : "POST", {
                  ...common,
                  ...(editor.record
                    ? { id: editor.record.id, version: editor.record.version }
                    : {
                        name: String(form.get("name")),
                        email: String(form.get("email")),
                        delivery: staffDelivery,
                        ...(staffDelivery === "password"
                          ? { password: String(form.get("password")) }
                          : {}),
                      }),
                  role: String(form.get("role")),
                  active: form.has("active"),
                  branchIds: form.getAll("branchIds").map(String),
                });
              }
            }}
          >
            <fieldset disabled={pending} className="drawer-fields">
              {editor.kind === "branch" ? (
                <>
                  <label className="field">
                    Branch name
                    <input
                      name="name"
                      required
                      maxLength={100}
                      defaultValue={editor.record?.name}
                    />
                  </label>
                  <label className="field">
                    Branch code
                    <input
                      name="code"
                      required
                      pattern={"(?:[A-Z0-9]|-){2,16}"}
                      maxLength={16}
                      defaultValue={editor.record?.code}
                    />
                  </label>
                </>
              ) : (
                <>
                  {!editor.record ? (
                    <>
                      <label className="field">
                        Full name
                        <input name="name" required maxLength={100} />
                      </label>
                      <label className="field">
                        Staff email
                        <input
                          name="email"
                          type="email"
                          required
                          autoComplete="off"
                        />
                      </label>
                      <label className="field">
                        Account setup
                        <select
                          aria-label="Account setup"
                          value={staffDelivery}
                          onChange={(e) => setStaffDelivery(e.target.value)}
                        >
                          <option value="password">
                            Choose an initial password
                          </option>
                          <option value="email">Email staff invitation</option>
                        </select>
                      </label>
                      {staffDelivery === "password" ? (
                        <label className="field">
                          Initial password
                          <input
                            name="password"
                            type="password"
                            autoComplete="new-password"
                            minLength={12}
                            maxLength={128}
                            required
                          />
                        </label>
                      ) : null}
                      <p className="support">
                        {staffDelivery === "password"
                          ? "No email is sent. The staff member will use these initial credentials."
                          : "A one-use password setup link will be sent from contact@hanovadevs.com. It expires in 30 minutes."}
                      </p>
                    </>
                  ) : (
                    <p className="drawer-intro">
                      {editor.record.name} · {editor.record.email}
                    </p>
                  )}
                  <label className="field">
                    Role
                    <select
                      name="role"
                      defaultValue={editor.record?.role ?? "receptionist"}
                    >
                      {[
                        "owner",
                        "manager",
                        "receptionist",
                        "trainer",
                        "accountant",
                      ].map((role) => (
                        <option key={role} value={role}>
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="grant-fields">
                    <legend>Branch grants</legend>
                    <p className="support">
                      Owners have organization-wide access. Other active staff
                      need at least one active branch.
                    </p>
                    {data.branches.map((branch) => (
                      <label key={branch.id}>
                        <input
                          type="checkbox"
                          name="branchIds"
                          value={branch.id}
                          defaultChecked={
                            editor.record?.branchIds.includes(branch.id) ??
                            false
                          }
                        />
                        {branch.name}
                        {branch.active ? "" : " (inactive)"}
                      </label>
                    ))}
                  </fieldset>
                </>
              )}
              <label className="check-field">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={editor.record?.active ?? true}
                />{" "}
                Active
              </label>
              <label className="field">
                Reason for change
                <input name="reason" required minLength={3} maxLength={300} />
              </label>
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                className="primary"
                disabled={pending || reloadRequired}
              >
                {pending ? "Saving…" : "Save changes"}
              </button>
            </fieldset>
          </form>
        </Drawer>
      ) : null}
    </div>
  );
}
