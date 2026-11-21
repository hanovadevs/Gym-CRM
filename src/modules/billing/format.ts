import { fractionDigits } from "@/modules/plans/format";
export function exactMoney(
  value: string | number,
  currency: string,
  locale = "en-PK",
) {
  const n = BigInt(value),
    digits = fractionDigits(currency),
    scale = 10n ** BigInt(digits);
  if (n < 0n) throw new Error("Invoice amounts cannot be negative");
  const fraction = (n % scale).toString().padStart(digits, "0");
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
    .formatToParts(n / scale)
    .map((p) => (p.type === "fraction" ? fraction : p.value))
    .join("");
}
export function invoiceStatus(
  i: {
    status: string;
    balanceMinor: string;
    dueOn: string;
    totalMinor?: string;
    hasCorrections?: boolean;
  },
  today: string,
) {
  return i.status === "void"
    ? "Void"
    : i.status === "draft"
      ? "Draft"
      : BigInt(i.balanceMinor) === 0n
        ? i.hasCorrections
          ? "Settled"
          : BigInt(i.totalMinor ?? "0") > 0n
            ? "Paid"
            : "No balance"
        : i.dueOn < today
          ? "Overdue"
          : i.totalMinor && BigInt(i.balanceMinor) < BigInt(i.totalMinor)
            ? "Partially paid"
            : "Outstanding";
}
