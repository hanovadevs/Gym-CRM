/** Shift an ISO calendar date, including same-day and backward navigation. */
export function shiftDate(value: string, days: number) {
  if (!Number.isInteger(days) || Math.abs(days) > 3660)
    throw Error("Invalid calendar range.");
  const date = new Date(value + "T12:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw Error("Invalid calendar date.");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
