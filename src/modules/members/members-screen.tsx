"use client";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { SectionTitle } from "@/components/ui/section-title";
import { MemberEditor } from "./member-editor";
import { useHydrated } from "@/lib/use-hydrated";
import type { Directory, Member } from "./types";
import type { DirectoryQuery } from "./schemas";
function url(query: DirectoryQuery, search = true) {
  const params = new URLSearchParams({
    organizationId: query.organizationId!,
    sort: query.sort,
    page: String(query.page),
  });
  if (query.branchId) params.set("branchId", query.branchId);
  params.set("status", query.status);
  if (search && query.q) params.set("q", query.q);
  return params.toString();
}
export function MembersScreen({ initial }: { initial: Directory }) {
  const hydrated = useHydrated();
  const [data, setData] = useState(initial),
    [query, setQuery] = useState(initial.query),
    [search, setSearch] = useState(initial.query.q),
    [listError, setListError] = useState(""),
    [notice, setNotice] = useState(""),
    [nextMemberId, setNextMemberId] = useState(""),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [reloadRequired, setReloadRequired] = useState(false),
    [editor, setEditor] = useState<{ record?: Member } | null>(null),
    [revision, setRevision] = useState(0);
  const lastRequest = useRef(
    JSON.stringify({ query: initial.query, revision: 0 }),
  );
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setQuery((q) =>
          q.q === search.trim() ? q : { ...q, q: search.trim(), page: 1 },
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    // Both initial Strict Mode effect setups already have the server data.
    // An unnecessary hydration fetch can rewrite history during a profile link transition.
    const request = JSON.stringify({ query, revision });
    if (request === lastRequest.current) return;
    lastRequest.current = request;
    const controller = new AbortController();
    setLoading(true);
    setListError("");
    fetch("/api/members?" + url(query), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error?.message ?? "Could not load members.");
        if (
          controller.signal.aborted ||
          window.location.pathname !== "/members"
        )
          return;
        setData(result.data);
        setReloadRequired(false);
        window.history.replaceState(
          null,
          "",
          "/members?" + url(result.data.query, false),
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setListError(
            e instanceof TypeError
              ? "Could not reach the server. Retry to load the directory."
              : e.message,
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, revision]);
  const locked =
    !hydrated ||
    loading ||
    saving ||
    Boolean(editor) ||
    reloadRequired ||
    search.trim() !== data.query.q ||
    Boolean(listError);
  async function save(body: unknown, editing: boolean) {
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/members", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        return {
          ok: false as const,
          message: result.error?.message ?? "Could not save the member.",
          duplicates: result.error?.details?.duplicates,
          moreMatches: result.error?.details?.moreMatches,
        };
      const member = result.data.member;
      setNextMemberId(editing ? "" : member.id);
      setNotice(
        `${member.name} (${member.memberCode}) ${editing ? "updated" : "registered"}.`,
      );
      setEditor(null);
      // A confirmed commit must never be retried because its following list refresh failed.
      setReloadRequired(true);
      setRevision((r) => r + 1);
      return { ok: true as const };
    } catch (e) {
      return {
        ok: false as const,
        message:
          e instanceof TypeError
            ? "Could not reach the server. Your inputs are kept; retry uses the same registration."
            : "Could not read the server response. Your inputs are kept. Reload the directory before starting a new registration.",
      };
    } finally {
      setSaving(false);
    }
  }
  return (
    <WorkspaceFrame
      organization={data.organization}
      canManageSettings={data.canManageSettings}
    >
      <div className="page-heading">
        <div>
          <h1>Members</h1>
          <p>Manage member registration and contact details.</p>
        </div>
        <button
          className="primary"
          disabled={locked}
          onClick={() => {
            setNotice("");
            setEditor({});
          }}
        >
          Add member
        </button>
      </div>
      <p className="member-count">
        {loading
          ? "Loading this view…"
          : listError
            ? "Directory unavailable"
            : `${data.total} ${data.total === 1 ? "member" : "members"} in this view`}
      </p>
      <section className="members-directory" aria-busy={loading}>
        <SectionTitle
          title="Member directory"
          help="Search by name, member code, phone or email within your permitted branches. Registration alone does not mean an active membership or gym access. Open a profile to enroll, renew or manage membership history. Payment collection is upcoming."
        />
        <div className="member-filters">
          <label className="field directory-search">
            Search members
            <input
              type="search"
              placeholder="Name, member code, phone or email"
              maxLength={100}
              value={search}
              disabled={saving || Boolean(editor) || reloadRequired}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {data.branches.length > 1 ? (
            <label className="field">
              Branch scope
              <select
                aria-label="Branch scope"
                value={query.branchId ?? ""}
                disabled={saving || Boolean(editor) || reloadRequired}
                onChange={(e) =>
                  setQuery({
                    ...query,
                    branchId: e.target.value || undefined,
                    page: 1,
                  })
                }
              >
                <option value="">All permitted branches</option>
                {data.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="member-single-branch">{data.branches[0].name}</p>
          )}
          <label className="field">
            Sort members
            <select
              aria-label="Sort members"
              value={query.sort}
              disabled={saving || Boolean(editor) || reloadRequired}
              onChange={(e) =>
                setQuery({
                  ...query,
                  sort: e.target.value as DirectoryQuery["sort"],
                  page: 1,
                })
              }
            >
              <option value="name">Name A–Z</option>
              <option value="newest">Newest joining date</option>
              <option value="oldest">Oldest joining date</option>
              <option value="code">Member code</option>
            </select>
          </label>
          <label className="field">
            Records
            <select
              aria-label="Member records"
              value={query.status}
              disabled={saving || Boolean(editor) || reloadRequired}
              onChange={(e) =>
                setQuery({
                  ...query,
                  status: e.target.value as DirectoryQuery["status"],
                  page: 1,
                })
              }
            >
              <option value="registered">Registered</option>
              <option value="archived">Archived</option>
              <option value="all">All records</option>
            </select>
          </label>
          <button
            type="button"
            disabled={saving || Boolean(editor) || loading}
            onClick={() => setRevision((r) => r + 1)}
          >
            Reload directory
          </button>
        </div>
        {notice ? (
          <p className="form-message" role="status">
            {notice}
            {nextMemberId ? (
              <Link
                className="text-action"
                style={{ marginLeft: 12 }}
                href={`/members/${nextMemberId}?organizationId=${data.organization.id}`}
              >
                Open profile to enroll
              </Link>
            ) : null}
            {reloadRequired
              ? " Refreshing saved records is required before editing again."
              : ""}
          </p>
        ) : null}
        {loading ? (
          <p className="empty" role="status">
            Loading members…
          </p>
        ) : listError ? (
          <div className="form-error" role="alert">
            <p>
              {listError} Previous results are hidden until a successful reload.
            </p>
            <button onClick={() => setRevision((r) => r + 1)}>
              Retry directory
            </button>
            <Link className="text-action" href="/sign-in">
              Sign in again
            </Link>
          </div>
        ) : (
          <div className="panel member-table-panel">
            {data.members.length ? (
              <>
                <div className="table-scroll">
                  <table>
                    <caption className="sr-only">Registered members</caption>
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Contact</th>
                        <th>Home branch</th>
                        <th>Joined</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.members.map((member) => (
                        <tr key={member.id}>
                          <td>
                            <div className="member-identity">
                              <span
                                className="member-initials"
                                aria-hidden="true"
                              >
                                {member.name
                                  .split(/\s+/)
                                  .slice(0, 2)
                                  .map((n) => n[0])
                                  .join("")
                                  .toUpperCase()}
                              </span>
                              <div>
                                <strong>{member.name}</strong>
                                <span className="cell-secondary">
                                  {member.memberCode}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span>{member.phone || "No phone"}</span>
                            <span className="cell-secondary">
                              {member.email || "No email"}
                            </span>
                          </td>
                          <td>{member.branchName}</td>
                          <td>
                            {new Intl.DateTimeFormat(data.organization.locale, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              timeZone: "UTC",
                            }).format(new Date(member.joinedOn + "T12:00:00Z"))}
                          </td>
                          <td>
                            <Link
                              className="text-action member-view"
                              href={`/members/${member.id}?organizationId=${data.organization.id}`}
                            >
                              View {member.name}
                            </Link>
                            <button
                              className="text-action"
                              disabled={locked || Boolean(member.archivedAt)}
                              onClick={() => {
                                setNotice("");
                                setEditor({ record: member });
                              }}
                            >
                              Edit {member.name}
                            </button>
                            {member.archivedAt ? (
                              <span className="cell-secondary">Archived</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="member-pagination">
                  <span>
                    Showing {(data.page - 1) * 25 + 1}–
                    {Math.min(data.page * 25, data.total)} of {data.total}
                  </span>
                  <div>
                    <button
                      disabled={locked || data.page <= 1}
                      onClick={() =>
                        setQuery({ ...query, page: data.page - 1 })
                      }
                    >
                      Previous
                    </button>
                    <button
                      className="primary"
                      disabled={locked || data.page * 25 >= data.total}
                      onClick={() =>
                        setQuery({ ...query, page: data.page + 1 })
                      }
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty member-empty">
                <h2>
                  {query.q || query.branchId || query.status !== "registered"
                    ? "No members match this view"
                    : "No members registered yet"}
                </h2>
                <p>
                  {query.q || query.branchId || query.status !== "registered"
                    ? "Try another search or branch."
                    : "Add your first member to start the directory."}
                </p>
                {query.q || query.branchId || query.status !== "registered" ? (
                  <button
                    onClick={() => {
                      setSearch("");
                      setQuery({
                        ...query,
                        q: "",
                        branchId: undefined,
                        status: "registered",
                        page: 1,
                      });
                    }}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            )}
          </div>
        )}
      </section>
      {editor ? (
        <MemberEditor
          data={data}
          record={editor.record}
          busy={saving}
          onSave={save}
          onClose={() => {
            if (!saving) setEditor(null);
          }}
        />
      ) : null}
    </WorkspaceFrame>
  );
}
