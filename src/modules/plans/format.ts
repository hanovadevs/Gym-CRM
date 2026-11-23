export function fractionDigits(currency: string) {
  // ISO accounting units, not CLDR display/cash rounding (which reports PKR as zero).
  if (
    [
      "BIF",
      "CLP",
      "DJF",
      "GNF",
      "ISK",
      "JPY",
      "KMF",
      "KRW",
      "PYG",
      "RWF",
      "UGX",
      "UYI",
      "VND",
      "VUV",
      "XAF",
      "XOF",
      "XPF",
    ].includes(currency)
  )
    return 0;
  if (["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"].includes(currency))
    return 3;
  if (["CLF", "UYW"].includes(currency)) return 4;
  return 2;
}
export function todayInZone(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const field = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${field("year")}-${field("month")}-${field("day")}`;
}
export function parseAmount(value: string, currency: string) {
  const digits = fractionDigits(currency);
  if (
    !(
      digits === 0 ? /^\d+$/ : new RegExp("^\\d+(?:\\.\\d{1," + digits + "})?$")
    ).test(value)
  )
    throw new Error("Enter a valid amount for " + currency + ".");
  const [whole, fraction = ""] = value.split(".");
  const n =
    BigInt(whole) * 10n ** BigInt(digits) +
    BigInt(fraction.padEnd(digits, "0") || "0");
  if (n > 999999999999n) throw new Error("Amount is too large.");
  return Number(n);
}
export function amountInput(minor: number, currency: string) {
  return (minor / 10 ** fractionDigits(currency)).toFixed(
    fractionDigits(currency),
  );
}
export function money(minor: number, currency: string, locale = "en-PK") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits(currency),
    maximumFractionDigits: fractionDigits(currency),
  }).format(minor / 10 ** fractionDigits(currency));
}
export function term(count: number, unit: string) {
  return `${count} ${unit === "months" ? "calendar month" : "day"}${count === 1 ? "" : "s"}`;
}
function calendarDate(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== iso
  )
    throw new Error("Choose a valid calendar date.");
  return d;
}
export function endOn(start: string, count: number, unit: "months" | "days") {
  const d = calendarDate(start);
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > (unit === "months" ? 120 : 3650)
  )
    throw new Error("Invalid term.");
  if (unit === "days") d.setUTCDate(d.getUTCDate() + count);
  else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + count);
    const last = new Date(d.getTime());
    last.setUTCMonth(last.getUTCMonth() + 1);
    last.setUTCDate(0);
    d.setUTCDate(Math.min(day, last.getUTCDate()));
  }
  if (d.getUTCFullYear() > 9999)
    throw new Error("Term ends outside supported dates.");
  return d.toISOString().slice(0, 10);
}
export function previousDay(iso: string) {
  const d = calendarDate(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
