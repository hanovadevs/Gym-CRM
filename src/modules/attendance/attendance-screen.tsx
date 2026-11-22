"use client";
import Form from "next/form";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { SectionTitle } from "@/components/ui/section-title";
import { Drawer, Pill, Table } from "@/components/ui/primitives";
import { useHydrated } from "@/lib/use-hydrated";
import { eligibilityLabel } from "@/modules/memberships/state";
import type {
  AttendanceCandidate,
  AttendanceData,
  AttendanceResult,
} from "./types";
import { visitDuration } from "./format";
export function AttendanceScreen({ initial }: { initial: AttendanceData }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [data, setData] = useState(initial),
    [q, setQ] = useState(""),
    [searched, setSearched] = useState(""),
    [candidates, setCandidates] = useState<AttendanceCandidate[]>([]),
    [searching, setSearching] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [blocked, setBlocked] = useState(false),
    [retry, setRetry] = useState<Record<string, unknown> | null>(null),
    [override, setOverride] = useState<AttendanceCandidate | null>(null);
  const request = useRef<AbortController | null>(null),
    input = useRef<HTMLInputElement>(null),
    sequence = useRef(0);
  useEffect(() => () => request.current?.abort(), []);
  const locked = !hydrated || pending || blocked || !!retry;
  const query = new URLSearchParams({
    organizationId: data.organization.id,
    branchId: data.branchId,
    view: data.view,
    fromOn: data.fromOn,
    throughOn: data.throughOn,
    page: String(data.page),
  });
  async function refresh() {
    const r = await fetch("/api/attendance?" + query, { cache: "no-store" });
    const result = await r.json();
    if (!r.ok || !result.ok)
      throw Error(
        "Attendance was saved, but the list could not refresh. Reload before another action.",
      );
    setData(result.data);
  }
  async function search() {
    if (locked || !q.trim()) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++sequence.current;
    setSearching(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch(
        "/api/attendance/lookup?" +
          new URLSearchParams({
            organizationId: data.organization.id,
            branchId: data.branchId,
            q: q.trim(),
          }),
        { cache: "no-store", signal: controller.signal },
      );
      const result = await r.json();
      if (!r.ok || !result.ok)
        throw Error(result.error?.message ?? "Could not find members.");
      if (current !== sequence.current || controller.signal.aborted) return;
      setCandidates(result.data.candidates);
      setSearched(q.trim());
    } catch (e) {
      if (!controller.signal.aborted && current === sequence.current) {
        setError(
          e instanceof Error ? e.message : "Search unavailable. Try again.",
        );
        setCandidates([]);
      }
    } finally {
      if (current === sequence.current) setSearching(false);
    }
  }
  async function record(payload: Record<string, unknown>) {
    if (pending || blocked) return;
    setPending(true);
    setError("");
    setMessage("");
    setRetry(payload);
    try {
      const r = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await r.json();
      if (!r.ok || !result.ok) {
        if (r.status < 500) setRetry(null);
        if (
          result.error?.code === "FORBIDDEN" ||
          r.status === 401 ||
          r.status === 409
        )
          setBlocked(true);
        throw Error(result.error?.message ?? "Attendance could not be saved.");
      }
      const saved = result.data as AttendanceResult;
      setRetry(null);
      setOverride(null);
      setCandidates([]);
      setQ("");
      setSearched("");
      setMessage(
        saved.state === "checked_out"
          ? "Visit checked out."
          : saved.state === "already_inside"
            ? saved.foreignOpen
              ? "Already checked in at another branch. No new visit was created."
              : "Already checked in. No new visit was created."
            : "Member checked in.",
      );
      try {
        await refresh();
        input.current?.focus();
      } catch (e) {
        setBlocked(true);
        setError(
          e instanceof Error ? e.message : "Reload to see saved attendance.",
        );
      }
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "The response could not be received. Retry the same attendance request safely."
          : e instanceof Error
            ? e.message
            : "Attendance unavailable. Try again.",
      );
    } finally {
      setPending(false);
    }
  }
  const enter = (member: AttendanceCandidate, reason = "") =>
    record({
      operation: "check_in",
      organizationId: data.organization.id,
      branchId: data.branchId,
      memberId: member.id,
      overrideReason: reason,
      requestKey: crypto.randomUUID(),
    });
  const exit = (visitId: string) =>
    record({
      operation: "check_out",
      organizationId: data.organization.id,
      branchId: data.branchId,
      visitId,
      requestKey: crypto.randomUUID(),
    });
  const time = (value: string) =>
    new Intl.DateTimeFormat(data.organization.locale, {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: data.organization.timeZone,
    }).format(new Date(value));
  return (
    <WorkspaceFrame
      organization={data.organization}
      active="attendance"
      canManageSettings={data.canManageSettings}
      canManageMembers={data.canManageMembers}
      canReadPlans={data.canReadPlans}
      canReadBilling={data.canReadBilling}
    >
      <section className="page-heading">
        <div>
          <h1>Attendance</h1>
          <p>Keep check-ins quick and access decisions clear.</p>
        </div>
      </section>
      <Form action="/attendance" className="attendance-filters">
        <input
          type="hidden"
          name="organizationId"
          value={data.organization.id}
        />
        <label className="field">
          Branch
          <select
            aria-label="Branch"
            name="branchId"
            defaultValue={data.branchId}
            disabled={pending || !!retry}
          >
            {data.branches.map((b) => (
              <option value={b.id} key={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Records
          <select aria-label="Records" name="view" defaultValue={data.view}>
            <option value="today">Today</option>
            <option value="inside">Currently inside</option>
            <option value="history">History</option>
          </select>
        </label>
        <label className="field">
          History from
          <input name="fromOn" type="date" defaultValue={data.fromOn} />
        </label>
        <label className="field">
          Through
          <input name="throughOn" type="date" defaultValue={data.throughOn} />
        </label>
        <button type="submit" disabled={pending || !!retry}>
          Apply filters
        </button>
      </Form>
      <div className="invoice-summary">
        <section className="panel">
          <SectionTitle
            title="Checked in today"
            help={`Successful visit openings in ${data.organization.timeZone}, including repeat visits after checkout. Duplicate scans do not add visits.`}
          />
          <p className="invoice-metric">{data.summary.checkIns}</p>
        </section>
        <section className="panel">
          <SectionTitle
            title="Currently inside"
            help="Open visits in the selected branch. Earlier-day visits remain open until an actual checkout is recorded."
          />
          <p className="invoice-metric">{data.summary.inside}</p>
          {data.summary.stale ? (
            <p>{data.summary.stale} open from an earlier day</p>
          ) : null}
        </section>
        <section className="panel">
          <SectionTitle
            title="Average visit today"
            help="Completed visits that started today in this branch. Open visits are excluded from the average."
          />
          <p className="invoice-metric">
            {data.summary.averageSeconds === null
              ? "—"
              : visitDuration(data.summary.averageSeconds)}
          </p>
        </section>
      </div>
      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
      {error && !override ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      {blocked ? (
        <section className="panel">
          <p>Reload attendance before making another change.</p>
          <button onClick={() => location.reload()}>Reload attendance</button>
        </section>
      ) : retry && !pending && !override ? (
        <section className="panel">
          <p>The submitted request is kept for safe retry.</p>
          <button className="primary" onClick={() => record(retry)}>
            Retry attendance request
          </button>
        </section>
      ) : null}
      {!blocked ? (
        <section className="panel attendance-lookup">
          <SectionTitle
            title="Check in a member"
            help="Search a name, phone, member code or Mojym QR token. Keyboard scanners can enter the token here; confirm the matching member before check-in. Eligibility is checked again when saving."
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
            className="attendance-search"
          >
            <label className="field">
              Member lookup
              <input
                ref={input}
                autoFocus
                type="search"
                autoComplete="off"
                value={q}
                maxLength={120}
                placeholder="Member code, name, phone or QR token"
                disabled={locked}
                onChange={(e) => {
                  request.current?.abort();
                  sequence.current++;
                  setSearching(false);
                  setQ(e.target.value);
                  setCandidates([]);
                }}
              />
            </label>
            <button
              className="primary"
              disabled={locked || searching || !q.trim()}
            >
              {searching ? "Searching…" : "Find member"}
            </button>
          </form>
          {searched === q.trim() &&
          searched &&
          !searching &&
          !candidates.length ? (
            <p className="attendance-empty">
              No members match this lookup in your attendance scope.
            </p>
          ) : null}
          <div className="attendance-candidates">
            {searched === q.trim()
              ? candidates.map((c) => (
                  <article key={c.id} className="attendance-candidate">
                    <div>
                      <h3>{c.name}</h3>
                      <p>
                        {c.memberCode}
                        {c.phoneEnding
                          ? ` · Phone ending ${c.phoneEnding}`
                          : ""}
                      </p>
                    </div>
                    <Pill tone={c.access.allowed ? "success" : "warning"}>
                      {eligibilityLabel(c.access)}
                    </Pill>
                    {c.openVisitId ? (
                      c.openInBranch ? (
                        <button
                          disabled={locked}
                          onClick={() => exit(c.openVisitId!)}
                        >
                          Check out {c.name}
                        </button>
                      ) : (
                        <p>Visit open at another branch</p>
                      )
                    ) : c.access.allowed ? (
                      <button
                        className="primary"
                        disabled={locked}
                        onClick={() => enter(c)}
                      >
                        Check in {c.name}
                      </button>
                    ) : c.canOverride ? (
                      <button
                        disabled={locked}
                        onClick={() => {
                          setError("");
                          setOverride(c);
                        }}
                      >
                        Review access override
                      </button>
                    ) : (
                      <span>Check-in unavailable</span>
                    )}
                  </article>
                ))
              : null}
          </div>
        </section>
      ) : null}
      {!blocked ? (
        <section className="panel attendance-records">
          <SectionTitle
            title={
              data.view === "inside"
                ? "Open visits"
                : data.view === "history"
                  ? "Attendance history"
                  : "Today’s attendance"
            }
            help="Visits are attributed to the branch where they opened. Checkouts retain entry time and access decisions. Earlier-day open visits need review; their exit time is never filled automatically."
          />
          <Table caption="Attendance visits">
            <thead>
              <tr>
                <th>Member</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Duration</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.visits.map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>{v.memberName}</strong>
                    <small>{v.memberCode}</small>
                    {v.stale ? (
                      <small className="attendance-warning">
                        Open from earlier day
                      </small>
                    ) : null}
                    {v.overrideReason ? (
                      <small>Override: {v.overrideReason}</small>
                    ) : null}
                  </td>
                  <td>{time(v.checkedInAt)}</td>
                  <td>{v.checkedOutAt ? time(v.checkedOutAt) : "Inside"}</td>
                  <td>{visitDuration(v.durationSeconds)}</td>
                  <td>
                    {v.checkedOutAt ? (
                      <span>Completed</span>
                    ) : (
                      <button
                        disabled={locked}
                        onClick={() => exit(v.id)}
                        aria-label={`Check out visit for ${v.memberName}`}
                      >
                        Check out
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!data.visits.length ? (
            <p className="attendance-empty">No visits in this view.</p>
          ) : null}
          <nav className="member-pagination" aria-label="Attendance pages">
            <span>
              {data.total} visits · Page {data.page}
            </span>
            <button
              disabled={pending || data.page <= 1}
              onClick={() => {
                const params = new URLSearchParams(query);
                params.set("page", String(data.page - 1));
                router.push("/attendance?" + params);
              }}
            >
              Previous
            </button>
            <button
              disabled={pending || data.page * 25 >= data.total}
              onClick={() => {
                const params = new URLSearchParams(query);
                params.set("page", String(data.page + 1));
                router.push("/attendance?" + params);
              }}
            >
              Next
            </button>
          </nav>
        </section>
      ) : null}
      {override ? (
        <Drawer
          title="Review access override"
          onClose={() => setOverride(null)}
          busy={pending}
        >
          <form
            className="invoice-form"
            onSubmit={(e) => {
              e.preventDefault();
              const reason = String(
                new FormData(e.currentTarget).get("reason"),
              );
              void (retry ? record(retry) : enter(override, reason));
            }}
          >
            <SectionTitle
              title="One-visit exception"
              help="An owner or manager can approve this visit with a reason. Membership dates, unpaid balances and future eligibility remain governed by their saved policies."
            />
            <p>
              <strong>{override.name}</strong> · {override.memberCode}
            </p>
            <p>{eligibilityLabel(override.access)}</p>
            <label>
              Reason for access override
              <textarea
                name="reason"
                required
                minLength={3}
                maxLength={300}
                disabled={pending || !!retry}
              />
            </label>
            {error ? (
              <p role="alert" className="form-error">
                {error}
              </p>
            ) : null}
            <button className="primary" disabled={pending}>
              {pending
                ? "Saving…"
                : retry
                  ? "Retry attendance request"
                  : "Approve and check in"}
            </button>
          </form>
        </Drawer>
      ) : null}
    </WorkspaceFrame>
  );
}
