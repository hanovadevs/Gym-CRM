export function visitDuration(seconds: number | null) {
  return seconds === null
    ? "Open"
    : seconds < 60
      ? "Less than 1 min"
      : `${Math.floor(seconds / 60)} min`;
}
