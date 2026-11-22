"use client";
import { shiftDate } from "./calendar";
import { useState } from "react";
import Form from "next/form";
import Link from "next/link";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { Drawer, Table, Pill } from "@/components/ui/primitives";
import { SectionTitle } from "@/components/ui/section-title";
import { useHydrated } from "@/lib/use-hydrated";
import { daysBetween } from "@/modules/memberships/state";
import {
  ScheduleEditor,
  clockMinute,
  weekdays,
  type ScheduleAction,
} from "./editor";
import type { ClassData, ClassRow } from "./types";
export function ClassesScreen({ initial }: { initial: ClassData }) {
  const [data, setData] = useState(initial),
    [resources, setResources] = useState(false),
    [action, setAction] = useState<ScheduleAction | null>(null),
    [pending, setPending] = useState(false),
    [blocked, setBlocked] = useState(false),
    [error, setError] = useState("");
  const hydrated = useHydrated(),
    locked = !hydrated || pending || blocked,
    selected = data.selected,
    zone = data.organization.timeZone,
    days = Array.from({ length: daysBetween(data.from, data.to) + 1 }, (_, i) =>
      shiftDate(data.from, i),
    );
  function params(changes: Record<string, string | number | undefined> = {}) {
    const q: Record<string, string | number | undefined> = {
      organizationId: data.organization.id,
      branchId: data.branchId || undefined,
      trainerId: data.trainerId || undefined,
      from: data.from,
      to: data.to,
      mode: data.mode,
      page: data.page,
      classId: selected?.id,
      rosterPage: data.rosterPage,
      availabilityPage: data.availabilityPage,
      ...changes,
    };
    return new URLSearchParams(
      Object.entries(q)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    );
  }
  const href = (changes: Record<string, string | number | undefined>) =>
      "/classes?" + params(changes),
    clock = (value: string) =>
      new Intl.DateTimeFormat(data.organization.locale, {
        timeZone: zone,
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value)),
    date = (value: string) =>
      new Intl.DateTimeFormat(data.organization.locale, {
        timeZone: "UTC",
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date(value + "T12:00:00Z"));
  function open(a: ScheduleAction) {
    setResources(false);
    setAction(a);
  }
  async function refresh(result?: Record<string, unknown>) {
    setPending(true);
    setError("");
    try {
      const q = params();
      if (result?.branchId) {
        q.set("branchId", String(result.branchId));
        if (selected && result.branchId !== selected.branchId)
          q.delete("classId");
      }
      if (result?.trainerId) {
        q.set("trainerId", String(result.trainerId));
        q.delete("classId");
      }
      if (result?.classId) {
        q.set("classId", String(result.classId));
        q.delete("trainerId");
        q.set("page", "1");
        q.set("rosterPage", "1");
        if (
          result.date &&
          (String(result.date) < data.from || String(result.date) > data.to)
        ) {
          q.set("mode", "day");
          q.set("from", String(result.date));
          q.set("to", String(result.date));
        }
      }
      const r = await fetch("/api/classes?" + q, { cache: "no-store" }),
        v = await r.json();
      if (!r.ok || !v.ok)
        throw Error(v.error?.message ?? "Unable to refresh scheduling.");
      setData(v.data);
      setBlocked(false);
    } catch (e) {
      setBlocked(true);
      setError(
        e instanceof Error ? e.message : "Unable to refresh scheduling.",
      );
      throw e;
    } finally {
      setPending(false);
    }
  }
  function card(row: ClassRow) {
    return (
      <Link
        key={row.id}
        href={href({ classId: row.id, rosterPage: 1 })}
        className={
          "class-event" +
          (selected?.id === row.id ? " selected" : "") +
          (row.cancelled ? " cancelled" : "")
        }
        aria-label={"View " + row.title}
      >
        <strong>{row.title}</strong>
        <span>
          {clock(row.startsAt)} - {clock(row.endsAt)}
        </span>
        <small>{row.trainerName}</small>
        <span>
          {row.cancelled
            ? "Cancelled"
            : row.booked + " / " + row.capacity + " booked"}
        </span>
      </Link>
    );
  }
  const upcoming = selected?.upcoming;
  return (
    <WorkspaceFrame
      organization={data.organization}
      active="classes"
      canManageSettings={data.canManageSettings}
      canManageMembers={data.canManageMembers}
      canReadPlans={data.canReadPlans}
      canReadBilling={data.canReadBilling}
    >
      <div className="class-sections">
        <section className="page-heading">
          <div>
            <h1>Classes & schedule</h1>
            <p>Manage sessions, coaching availability and member bookings.</p>
          </div>
          <div className="platform-heading-actions">
            <button
              disabled={!hydrated || pending}
              onClick={() => refresh().catch(() => {})}
            >
              {pending ? "Refreshing..." : "Refresh schedule"}
            </button>
            <button disabled={!hydrated} onClick={() => setResources(true)}>
              {data.canManage ? "Manage resources" : "Availability & rooms"}
            </button>
            {data.canManage ? (
              <button
                className="primary"
                disabled={locked || !data.trainers.length}
                onClick={() => open({ operation: "session" })}
              >
                Create class
              </button>
            ) : null}
          </div>
        </section>
        {error ? (
          <p className="form-error" role="alert">
            {error}{" "}
            <button onClick={() => location.reload()}>Reload scheduling</button>
          </p>
        ) : null}
        {!data.trainers.length ? (
          <p className="panel">
            {data.own ? (
              "No active coaching profile is linked to your sign-in. Contact your gym administrator."
            ) : (
              <>
                Add an active{" "}
                <Link href={"/trainers?organizationId=" + data.organization.id}>
                  trainer profile
                </Link>{" "}
                before creating classes.
              </>
            )}
          </p>
        ) : null}
        <section className="panel class-toolbar">
          <SectionTitle
            title="Timetable"
            help="Class times use the gym time zone. Bookings check membership class access, branch, session dates, debt policy, capacity and overlapping sessions. Cancelled classes stay in history."
          />
          <div
            className="class-view-links"
            role="group"
            aria-label="Timetable view"
          >
            {(["week", "day", "list"] as const).map((mode) => (
              <Link
                key={mode}
                aria-current={mode === data.mode ? "page" : undefined}
                href={href({
                  mode,
                  classId: undefined,
                  page: 1,
                  rosterPage: 1,
                })}
              >
                {mode === "week" ? "Week" : mode === "day" ? "Day" : "List"}
              </Link>
            ))}
          </div>
          <Form action="/classes" className="class-filters">
            <input
              type="hidden"
              name="organizationId"
              value={data.organization.id}
            />
            <input type="hidden" name="mode" value={data.mode} />
            <label>
              From date
              <input
                type="date"
                name="from"
                defaultValue={data.from}
                required
              />
            </label>
            {data.mode === "list" ? (
              <label>
                Through date
                <input type="date" name="to" defaultValue={data.to} required />
              </label>
            ) : null}
            <label>
              Branch
              <select
                name="branchId"
                aria-label="Branch filter"
                defaultValue={data.branchId}
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
              Coach
              <select
                name="trainerId"
                aria-label="Coach filter"
                defaultValue={data.trainerId}
              >
                <option value="">
                  {data.own ? "My classes" : "All coaches"}
                </option>
                {data.trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Apply filters</button>
          </Form>
          <nav className="pagination" aria-label="Calendar dates">
            <Link
              href={href({
                from: shiftDate(data.from, -(data.mode === "day" ? 1 : 7)),
                to: undefined,
                classId: undefined,
                page: 1,
              })}
            >
              Previous {data.mode === "day" ? "day" : "week"}
            </Link>
            <Link
              href={href({
                from: data.organization.today,
                to: undefined,
                classId: undefined,
                page: 1,
              })}
            >
              Today
            </Link>
            <Link
              href={href({
                from: shiftDate(data.from, data.mode === "day" ? 1 : 7),
                to: undefined,
                classId: undefined,
                page: 1,
              })}
            >
              Next {data.mode === "day" ? "day" : "week"}
            </Link>
            <span>
              {date(data.from)}
              {data.to !== data.from ? " - " + date(data.to) : ""} / {zone}
            </span>
          </nav>
        </section>
        <div className="class-layout">
          <section
            className="panel class-calendar"
            aria-label="Class timetable"
          >
            {data.mode === "list" ? (
              <Table caption="Class list">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Date / time</th>
                    <th>Coach / room</th>
                    <th>Bookings</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.title}</strong>
                        {row.cancelled ? (
                          <small className="table-secondary">Cancelled</small>
                        ) : null}
                      </td>
                      <td>
                        {date(row.localDate)}
                        <small className="table-secondary">
                          {clock(row.startsAt)} - {clock(row.endsAt)}
                        </small>
                      </td>
                      <td>
                        {row.trainerName}
                        <small className="table-secondary">
                          {row.roomName ?? "No room reserved"}
                        </small>
                      </td>
                      <td>
                        {row.booked} / {row.capacity}
                      </td>
                      <td>
                        <Link href={href({ classId: row.id, rosterPage: 1 })}>
                          View {row.title}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <div
                className={
                  "class-week" + (data.mode === "day" ? " day-view" : "")
                }
              >
                {days.map((day) => (
                  <section
                    key={day}
                    className={
                      "class-day" +
                      (day === data.organization.today ? " today" : "")
                    }
                  >
                    <h2>{date(day)}</h2>
                    {data.rows.filter((row) => row.localDate === day).map(card)}
                    {!data.rows.some((row) => row.localDate === day) ? (
                      <p className="class-day-empty">
                        No sessions on this page
                      </p>
                    ) : null}
                  </section>
                ))}
              </div>
            )}
            {!data.total ? (
              <p>
                No classes in this date and branch selection.{" "}
                {data.canManage
                  ? "Save coach availability, then create a session."
                  : ""}
              </p>
            ) : null}
            <nav className="pagination" aria-label="Class pages">
              <span>
                {data.total} sessions / Page {data.page} / up to 50 per page
              </span>
              {data.page > 1 ? (
                <Link
                  href={href({
                    page: data.page - 1,
                    classId: undefined,
                    rosterPage: 1,
                  })}
                >
                  Previous sessions
                </Link>
              ) : null}
              {data.page * 50 < data.total ? (
                <Link
                  href={href({
                    page: data.page + 1,
                    classId: undefined,
                    rosterPage: 1,
                  })}
                >
                  Next sessions
                </Link>
              ) : null}
            </nav>
          </section>
          {selected ? (
            <aside className="panel class-details">
              <SectionTitle
                title={selected.title}
                help="Booked seats include active reservations only. Cancelled reservations remain in the roster. Past sessions are retained as read-only history."
              />
              <Pill tone={selected.cancelled ? "warning" : "success"}>
                {selected.cancelled
                  ? "Cancelled"
                  : upcoming
                    ? "Upcoming"
                    : "Past session"}
              </Pill>
              <dl className="review-list">
                <dt>When</dt>
                <dd>
                  {date(selected.localDate)} / {clock(selected.startsAt)} -{" "}
                  {clock(selected.endsAt)}
                </dd>
                <dt>Coach</dt>
                <dd>{selected.trainerName}</dd>
                <dt>Branch</dt>
                <dd>{selected.branchName}</dd>
                <dt>Room</dt>
                <dd>{selected.roomName ?? "No room reserved"}</dd>
                <dt>Bookings</dt>
                <dd>
                  {selected.booked} of {selected.capacity}
                </dd>
              </dl>
              {selected.cancelled ? (
                <p>Cancellation: {selected.cancellationReason}</p>
              ) : null}
              <div className="class-detail-actions">
                {data.canBook ? (
                  <button
                    className="primary"
                    disabled={
                      locked ||
                      !upcoming ||
                      selected.booked >= selected.capacity
                    }
                    onClick={() =>
                      open({ operation: "book", session: selected })
                    }
                  >
                    Add booking
                  </button>
                ) : null}
                {data.canManage && upcoming ? (
                  <>
                    <button
                      disabled={locked}
                      onClick={() =>
                        open({ operation: "session", session: selected })
                      }
                    >
                      Edit session
                    </button>
                    <button
                      disabled={locked}
                      onClick={() =>
                        open({ operation: "cancel_session", session: selected })
                      }
                    >
                      Cancel class
                    </button>
                  </>
                ) : null}
              </div>
              {upcoming && selected.booked >= selected.capacity ? (
                <p>This class is full. Cancel a booking to release a seat.</p>
              ) : null}
              <SectionTitle
                title="Booking roster"
                help="Only the member identity needed for this class is shown. Current role and branch permissions are checked again before any booking changes."
              />
              <ul className="class-roster">
                {data.roster.map((b) => (
                  <li key={b.id}>
                    <div>
                      <strong>{b.name}</strong>
                      <small>
                        {b.memberCode} /{" "}
                        {b.cancelled
                          ? "Cancelled"
                          : selected.cancelled
                            ? "Session cancelled"
                            : "Booked"}
                      </small>
                      {b.cancelled ? (
                        <small>{b.cancellationReason}</small>
                      ) : null}
                    </div>
                    {data.canBook && upcoming && !b.cancelled ? (
                      <button
                        disabled={locked}
                        onClick={() =>
                          open({
                            operation: "cancel_booking",
                            session: selected,
                            booking: b,
                          })
                        }
                      >
                        Cancel booking for {b.name}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {!data.roster.length ? (
                <p>No bookings for this session.</p>
              ) : null}
              <nav className="pagination" aria-label="Booking roster pages">
                <span>
                  {data.rosterTotal} retained bookings / Page {data.rosterPage}
                </span>
                {data.rosterPage > 1 ? (
                  <Link href={href({ rosterPage: data.rosterPage - 1 })}>
                    Previous bookings
                  </Link>
                ) : null}
                {data.rosterPage * 25 < data.rosterTotal ? (
                  <Link href={href({ rosterPage: data.rosterPage + 1 })}>
                    Next bookings
                  </Link>
                ) : null}
              </nav>
            </aside>
          ) : null}
        </div>
        {resources ? (
          <Drawer
            title="Scheduling resources"
            onClose={() => setResources(false)}
          >
            <SectionTitle
              title="Rooms"
              help="Rooms belong to one branch. Sessions share the same room and trainer conflict checks as personal training."
            />
            {data.canManage ? (
              <button
                className="primary"
                disabled={locked}
                onClick={() => open({ operation: "room" })}
              >
                Add room
              </button>
            ) : null}
            <Table caption="Scheduling rooms">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Branch</th>
                  <th>Capacity</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.rooms.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.branchName}</td>
                    <td>{r.capacity}</td>
                    <td>{r.active ? "Active" : "Inactive"}</td>
                    <td>
                      {data.canManage ? (
                        <button
                          disabled={locked}
                          onClick={() => open({ operation: "room", room: r })}
                        >
                          Edit {r.name}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {!data.rooms.length ? (
              <p>
                No rooms configured. A class can run without reserving a room.
              </p>
            ) : null}
            <SectionTitle
              title="Weekly coaching availability"
              help="Use the timetable coach filter to choose whose hours are shown. Sessions must fit these saved branch hours; overnight windows can continue into the next weekday."
            />
            <p>
              {data.trainers.find((t) => t.id === data.availabilityTrainerId)
                ?.name ?? "No coach selected"}{" "}
              / {zone}
            </p>
            {data.canManage ? (
              <button
                className="primary"
                disabled={locked || !data.trainers.length}
                onClick={() => open({ operation: "availability" })}
              >
                Add availability
              </button>
            ) : null}
            <Table caption="Coaching availability">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Hours</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.availability.map((a) => (
                  <tr key={a.id}>
                    <td>{weekdays[a.weekday]}</td>
                    <td>
                      {clockMinute(a.startMinute)} - {clockMinute(a.endMinute)}
                    </td>
                    <td>{a.branchName}</td>
                    <td>{a.active ? "Active" : "Inactive"}</td>
                    <td>
                      {data.canManage ? (
                        <button
                          disabled={locked}
                          onClick={() =>
                            open({ operation: "availability", availability: a })
                          }
                        >
                          Edit {weekdays[a.weekday]} availability
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {!data.availability.length ? (
              <p>No saved hours for this coach and branch selection.</p>
            ) : null}
            <nav className="pagination" aria-label="Availability pages">
              <span>
                {data.availabilityTotal} windows / Page {data.availabilityPage}
              </span>
              {data.availabilityPage > 1 ? (
                <Link
                  href={href({ availabilityPage: data.availabilityPage - 1 })}
                >
                  Previous availability
                </Link>
              ) : null}
              {data.availabilityPage * 25 < data.availabilityTotal ? (
                <Link
                  href={href({ availabilityPage: data.availabilityPage + 1 })}
                >
                  Next availability
                </Link>
              ) : null}
            </nav>
          </Drawer>
        ) : null}
        {action ? (
          <ScheduleEditor
            action={action}
            data={data}
            onClose={() => setAction(null)}
            onBlock={() => {
              setBlocked(true);
              setError(
                "Scheduling changed. Reload current details before another change.",
              );
            }}
            saved={refresh}
          />
        ) : null}
      </div>
    </WorkspaceFrame>
  );
}
