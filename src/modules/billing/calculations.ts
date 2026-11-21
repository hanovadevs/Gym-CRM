import type { LineInput } from "./schemas";
export function invoiceTotals(lines: LineInput[]) {
  if (!lines.length || lines.length > 30)
    throw new Error("Include between 1 and 30 invoice lines.");
  let subtotal = 0n,
    discount = 0n;
  const items = lines.map((line, position) => {
    for (const n of [line.quantity, line.unitMinor, line.discountMinor])
      if (!Number.isSafeInteger(n) || n < 0)
        throw new Error("Use valid integer amounts and quantities.");
    if (
      line.quantity < 1 ||
      line.quantity > 10000 ||
      line.unitMinor > 999999999999 ||
      line.discountMinor > 999999999999
    )
      throw new Error("A line exceeds supported amounts or quantities.");
    const gross = BigInt(line.quantity) * BigInt(line.unitMinor),
      d = BigInt(line.discountMinor);
    if (d > gross) throw new Error("A line discount cannot exceed its charge.");
    subtotal += gross;
    discount += d;
    if (subtotal > 999999999999n)
      throw new Error("The invoice subtotal is too large.");
    return { ...line, position: position + 1, totalMinor: Number(gross - d) };
  });
  return {
    items,
    subtotalMinor: Number(subtotal),
    discountMinor: Number(discount),
    totalMinor: Number(subtotal - discount),
  };
}
