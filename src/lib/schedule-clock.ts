export function localInput(value: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const p = (k: string) => parts.find((x) => x.type === k)!.value;
  return (
    p("year") +
    "-" +
    p("month") +
    "-" +
    p("day") +
    "T" +
    p("hour") +
    ":" +
    p("minute")
  );
}
export function offset(value: string, zone: string) {
  const name = new Intl.DateTimeFormat("en", {
    timeZone: zone,
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(value))
    .find((p) => p.type === "timeZoneName")!.value;
  return name === "GMT" ? "+00:00" : name.replace("GMT", "");
}
