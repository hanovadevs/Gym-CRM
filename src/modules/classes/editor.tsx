"use client";
import { localInput, offset } from "@/lib/schedule-clock";
import { shiftDate } from "./calendar";
import { useEffect, useRef, useState } from "react";
import { Drawer } from "@/components/ui/primitives";
import type {
  ClassData,
  ClassRow,
  ClassBooking,
  ScheduleRoom,
  Availability,
  ClassMember,
} from "./types";
export type ScheduleAction = {
  operation:
    | "session"
    | "cancel_session"
    | "book"
    | "cancel_booking"
    | "room"
    | "availability";
  session?: ClassRow;
  booking?: ClassBooking;
  room?: ScheduleRoom;
  availability?: Availability;
};
export function clockMinute(n: number) {
  return (
    String(Math.floor(n / 60)).padStart(2, "0") +
    ":" +
    String(n % 60).padStart(2, "0")
  );
}
export const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
function minute(v: string) {
  if (!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(v) && v !== "24:00")
    throw Error("Use HH:MM for availability, with 24:00 for midnight.");
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}
export function ScheduleEditor({
  action,
  data,
  onClose,
  saved,
  onBlock,
}: {
  action: ScheduleAction;
  data: ClassData;
  onClose: () => void;
  saved: (r: Record<string, unknown>) => Promise<void>;
  onBlock: () => void;
}) {
  const [key] = useState(() => crypto.randomUUID()),
    [id] = useState(
      () =>
        action.session?.id ??
        action.room?.id ??
        action.availability?.id ??
        crypto.randomUUID(),
    ),
    [prepared, setPrepared] = useState<Record<string, unknown> | null>(null),
    [pending, setPending] = useState(false),
    [attempted, setAttempted] = useState(false),
    [blocked, setBlocked] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState(""),
    [memberName, setMemberName] = useState("");
  const session = action.session ?? data.selected,
    room = action.room,
    availability = action.availability,
    booking = action.booking,
    op = action.operation,
    zone = data.organization.timeZone,
    tomorrow = shiftDate(data.organization.today, 1),
    start = action.session
      ? localInput(action.session.startsAt, zone)
      : tomorrow + "T17:00",
    end = action.session
      ? localInput(action.session.endsAt, zone)
      : tomorrow + "T18:00";
  const title =
    op === "session"
      ? action.session
        ? "Edit session"
        : "Create class"
      : op === "room"
        ? room
          ? "Edit room"
          : "Add room"
        : op === "availability"
          ? availability
            ? "Edit availability"
            : "Add availability"
          : op === "book"
            ? "Add class booking"
            : op === "cancel_booking"
              ? "Cancel booking"
              : "Cancel class";
  async function confirm() {
    if (!prepared || pending || blocked) return;
    setPending(true);
    setAttempted(true);
    setError("");
    try {
      const r = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prepared),
      });
      const v = await r.json();
      if (!r.ok || !v.ok) {
        if (r.status === 409 || r.status === 403) {
          setBlocked(true);
          onBlock();
        } else if (r.status === 422) {
          setPrepared(null);
          setAttempted(false);
        }
        throw Error(v.error?.message ?? "Unable to save scheduling change.");
      }
      setDone(true);
      await saved(v.data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to reach the server. Retry the same reviewed request.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Drawer title={title} onClose={onClose} busy={pending}>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {done ? (
        <section>
          <h3>Schedule saved</h3>
          <p>The schedule change and audit history were saved together.</p>
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </section>
      ) : (
        <>
          <form
            className="invoice-form"
            hidden={!!prepared}
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              const f = new FormData(e.currentTarget),
                base = {
                  organizationId: data.organization.id,
                  requestKey: key,
                  reason: String(f.get("reason")),
                };
              try {
                let body: Record<string, unknown>;
                if (op === "session") {
                  const stamp = (name: string) => {
                    const value = String(f.get(name));
                    return (
                      value +
                      (value.length === 16 ? ":00" : "") +
                      String(f.get(name + "Offset"))
                    );
                  };
                  body = {
                    ...base,
                    operation: op,
                    id,
                    ...(action.session
                      ? { version: action.session.version }
                      : {}),
                    branchId: action.session?.branchId ?? f.get("branchId"),
                    trainerId: action.session?.trainerId ?? f.get("trainerId"),
                    roomId: f.get("roomId") || null,
                    title: f.get("title"),
                    startsAt: stamp("startsAt"),
                    endsAt: stamp("endsAt"),
                    capacity: Number(f.get("capacity")),
                  };
                } else if (op === "room")
                  body = {
                    ...base,
                    operation: op,
                    id,
                    ...(room ? { version: room.version } : {}),
                    branchId: room?.branchId ?? f.get("branchId"),
                    name: f.get("name"),
                    capacity: Number(f.get("capacity")),
                    active: f.get("active") === "on",
                  };
                else if (op === "availability")
                  body = {
                    ...base,
                    operation: op,
                    id,
                    ...(availability ? { version: availability.version } : {}),
                    trainerId: availability?.trainerId ?? f.get("trainerId"),
                    branchId: availability?.branchId ?? f.get("branchId"),
                    weekday: availability?.weekday ?? Number(f.get("weekday")),
                    startMinute: minute(String(f.get("startTime"))),
                    endMinute: minute(String(f.get("endTime"))),
                    active: f.get("active") === "on",
                  };
                else if (op === "book") {
                  if (!f.get("memberId"))
                    throw Error("Choose an eligible member before reviewing.");
                  body = {
                    ...base,
                    operation: op,
                    classId: session?.id,
                    memberId: f.get("memberId"),
                  };
                } else if (op === "cancel_booking")
                  body = {
                    ...base,
                    operation: op,
                    classId: session?.id,
                    bookingId: booking?.id,
                    version: booking?.version,
                  };
                else
                  body = {
                    ...base,
                    operation: op,
                    classId: session?.id,
                    version: session?.version,
                  };
                setPrepared(body);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Review the scheduling details.",
                );
              }
            }}
          >
            {op === "session" ? (
              <>
                <label>
                  Class title
                  <input
                    name="title"
                    required
                    minLength={3}
                    maxLength={120}
                    defaultValue={action.session?.title}
                  />
                </label>
                <label>
                  Branch
                  <select
                    name="branchId"
                    aria-label="Branch"
                    required
                    defaultValue={action.session?.branchId ?? data.branchId}
                    disabled={!!action.session}
                  >
                    <option value="">Choose branch</option>
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
                    aria-label="Coach"
                    required
                    defaultValue={action.session?.trainerId ?? data.trainerId}
                    disabled={!!action.session}
                  >
                    <option value="">Choose coach</option>
                    {data.trainers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                {action.session ? (
                  <p>
                    Branch and coach stay with this session. To replace either,
                    cancel this session and create its replacement.
                  </p>
                ) : null}
                <label>
                  Room
                  <select
                    name="roomId"
                    aria-label="Room"
                    defaultValue={action.session?.roomId ?? ""}
                  >
                    <option value="">No reserved room</option>
                    {action.session?.roomId &&
                    !data.rooms.some((r) => r.id === action.session?.roomId) ? (
                      <option value={action.session.roomId}>
                        {action.session.roomName}
                      </option>
                    ) : null}
                    {data.rooms
                      .filter(
                        (r) => r.active || r.id === action.session?.roomId,
                      )
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} / {r.branchName} / {r.capacity} seats
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Starts at
                  <input
                    name="startsAt"
                    type="datetime-local"
                    required
                    defaultValue={start}
                  />
                </label>
                <label>
                  Ends at
                  <input
                    name="endsAt"
                    type="datetime-local"
                    required
                    defaultValue={end}
                  />
                </label>
                <p>
                  Enter gym-local time in {zone}. The entire session must fit
                  the coach’s saved availability.
                </p>
                <details>
                  <summary>Time zone offsets</summary>
                  <p>
                    Review offsets for dates crossing daylight saving changes.
                    Both must match this gym’s time zone.
                  </p>
                  <label>
                    Start UTC offset
                    <input
                      name="startsAtOffset"
                      required
                      pattern="(?:[+]|-)[0-9]{2}:[0-9]{2}"
                      defaultValue={offset(
                        action.session?.startsAt ?? tomorrow + "T12:00:00Z",
                        zone,
                      )}
                    />
                  </label>
                  <label>
                    End UTC offset
                    <input
                      name="endsAtOffset"
                      required
                      pattern="(?:[+]|-)[0-9]{2}:[0-9]{2}"
                      defaultValue={offset(
                        action.session?.endsAt ?? tomorrow + "T13:00:00Z",
                        zone,
                      )}
                    />
                  </label>
                </details>
                <label>
                  Class capacity
                  <input
                    name="capacity"
                    type="number"
                    min={1}
                    max={500}
                    required
                    defaultValue={action.session?.capacity ?? 12}
                  />
                </label>
              </>
            ) : null}
            {op === "room" ? (
              <>
                <label>
                  Room name
                  <input
                    name="name"
                    required
                    maxLength={80}
                    defaultValue={room?.name}
                  />
                </label>
                <label>
                  Branch
                  <select
                    name="branchId"
                    aria-label="Branch"
                    required
                    disabled={!!room}
                    defaultValue={room?.branchId ?? data.branchId}
                  >
                    <option value="">Choose branch</option>
                    {data.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Room capacity
                  <input
                    name="capacity"
                    type="number"
                    required
                    min={1}
                    max={500}
                    defaultValue={room?.capacity ?? 16}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={room?.active ?? true}
                  />
                  Active room
                </label>
                <p>
                  Resolve upcoming sessions before deactivating a room or
                  reducing capacity below their class sizes.
                </p>
              </>
            ) : null}
            {op === "availability" ? (
              <>
                <label>
                  Coach
                  <select
                    name="trainerId"
                    aria-label="Coach"
                    required
                    disabled={!!availability}
                    defaultValue={
                      availability?.trainerId ??
                      data.availabilityTrainerId ??
                      ""
                    }
                  >
                    <option value="">Choose coach</option>
                    {data.trainers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Branch
                  <select
                    name="branchId"
                    aria-label="Branch"
                    required
                    disabled={!!availability}
                    defaultValue={availability?.branchId ?? data.branchId}
                  >
                    <option value="">Choose branch</option>
                    {data.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Weekday
                  <select
                    name="weekday"
                    aria-label="Weekday"
                    disabled={!!availability}
                    defaultValue={availability?.weekday ?? 1}
                  >
                    {weekdays.map((day, i) => (
                      <option value={i} key={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start time
                  <input
                    name="startTime"
                    type="time"
                    required
                    defaultValue={clockMinute(availability?.startMinute ?? 540)}
                  />
                </label>
                <label>
                  End time
                  <input
                    name="endTime"
                    required
                    pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00"
                    defaultValue={clockMinute(availability?.endMinute ?? 1260)}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={availability?.active ?? true}
                  />
                  Active availability
                </label>
                <p>
                  Weekly hours use {zone}. Use 24:00 for midnight; split
                  overnight availability across two weekdays. Resolve upcoming
                  sessions before narrowing these hours.
                </p>
              </>
            ) : null}
            {op === "book" && session ? (
              <>
                <p>
                  {session.title} / {session.booked} of {session.capacity}{" "}
                  booked
                </p>
                <MemberPicker
                  data={data}
                  classId={session.id}
                  choose={setMemberName}
                />
              </>
            ) : null}
            {op === "cancel_session" ? (
              <p>
                Cancel {session?.title}. The session and booking history stay
                saved. Its trainer and room become available for another
                session.
              </p>
            ) : null}
            {op === "cancel_booking" ? (
              <p>
                Cancel {booking?.name}’s booking for {session?.title}. The seat
                becomes available, and the cancellation stays in history.
              </p>
            ) : null}
            <label>
              Reason
              <input name="reason" minLength={3} maxLength={300} required />
            </label>
            <button className="primary" type="submit">
              Review schedule
            </button>
          </form>
          {prepared ? (
            <section>
              <h3>Review schedule</h3>
              <dl className="review-list">
                <dt>Change</dt>
                <dd>{title}</dd>
                <dt>Record</dt>
                <dd>
                  {String(
                    prepared.title ??
                      prepared.name ??
                      session?.title ??
                      "Weekly availability",
                  )}
                </dd>
                {op === "book" || op === "cancel_booking" ? (
                  <>
                    <dt>Member</dt>
                    <dd>{memberName || booking?.name}</dd>
                  </>
                ) : null}
                {op === "session" ? (
                  <>
                    <dt>Starts</dt>
                    <dd>{String(prepared.startsAt)}</dd>
                    <dt>Ends</dt>
                    <dd>{String(prepared.endsAt)}</dd>
                    <dt>Capacity</dt>
                    <dd>{String(prepared.capacity)}</dd>
                  </>
                ) : null}
                {op === "availability" ? (
                  <>
                    <dt>Hours</dt>
                    <dd>
                      {weekdays[Number(prepared.weekday)]}{" "}
                      {clockMinute(Number(prepared.startMinute))}–
                      {clockMinute(Number(prepared.endMinute))}
                    </dd>
                  </>
                ) : null}
                <dt>Branch</dt>
                <dd>
                  {
                    data.branches.find(
                      (b) => b.id === (prepared.branchId ?? session?.branchId),
                    )?.name
                  }
                </dd>
                <dt>Reason</dt>
                <dd>{String(prepared.reason)}</dd>
              </dl>
              <button
                className="primary"
                disabled={pending || blocked}
                onClick={confirm}
              >
                {pending
                  ? "Saving…"
                  : attempted
                    ? "Retry save"
                    : "Confirm schedule"}
              </button>
              {!attempted ? (
                <button onClick={() => setPrepared(null)}>Back to edit</button>
              ) : null}
              {blocked ? (
                <p>Reload current scheduling details before another change.</p>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </Drawer>
  );
}
function MemberPicker({
  data,
  classId,
  choose,
}: {
  data: ClassData;
  classId: string;
  choose: (name: string) => void;
}) {
  const [q, setQ] = useState(""),
    [rows, setRows] = useState<ClassMember[]>([]),
    [pending, setPending] = useState(false),
    [searched, setSearched] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function search() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setPending(true);
    setError("");
    try {
      if (q.trim().length < 2)
        throw Error("Enter at least two characters of a name or member code.");
      const r = await fetch(
        "/api/classes/members?" +
          new URLSearchParams({
            organizationId: data.organization.id,
            classId,
            q: q.trim(),
          }),
        { cache: "no-store", signal: current.signal },
      );
      const v = await r.json();
      if (!r.ok || !v.ok)
        throw Error(v.error?.message ?? "Unable to find members.");
      if (!current.signal.aborted) {
        setRows(v.data.rows);
        setSearched(true);
      }
    } catch (e) {
      if (!current.signal.aborted)
        setError(e instanceof Error ? e.message : "Unable to find members.");
    } finally {
      if (!current.signal.aborted) setPending(false);
    }
  }
  return (
    <fieldset>
      <legend>Choose a member</legend>
      <label>
        Member search
        <input
          value={q}
          maxLength={100}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
        />
      </label>
      <button type="button" disabled={pending} onClick={search}>
        {pending ? "Searching…" : "Search members"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {rows.map((m) => (
        <label className="class-member-option" key={m.id}>
          <input
            type="radio"
            name="memberId"
            value={m.id}
            disabled={!m.eligible || m.conflict || m.booked}
            onChange={() => choose(m.name)}
          />
          <span>
            <strong>{m.name}</strong>
            <small>
              {m.memberCode} /{" "}
              {m.booked
                ? "Already booked"
                : !m.eligible
                  ? "Class access required"
                  : m.conflict
                    ? "Another session overlaps"
                    : "Eligible"}
            </small>
          </span>
        </label>
      ))}
      {searched && !rows.length ? (
        <p>No members match this search in your branch scope.</p>
      ) : null}
      <p>
        Up to 20 matches. Booking rechecks membership access, schedule conflicts
        and available seats.
      </p>
    </fieldset>
  );
}
