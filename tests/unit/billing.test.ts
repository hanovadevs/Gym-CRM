import { describe, it, expect } from "vitest";
import { invoiceTotals } from "../../src/modules/billing/calculations";
import { exactMoney, invoiceStatus } from "../../src/modules/billing/format";
import { invoiceQuery } from "../../src/modules/billing/schemas";
describe("Invoice arithmetic and status", () => {
  it("calculates quantity and fixed discounts exactly", () => {
    expect(
      invoiceTotals([
        {
          description: "Fee",
          quantity: 3,
          unitMinor: 125050,
          discountMinor: 5000,
        },
      ]),
    ).toMatchObject({
      subtotalMinor: 375150,
      discountMinor: 5000,
      totalMinor: 370150,
    });
  });
  it("rejects excess discounts, invalid quantities and aggregate overflow", () => {
    for (const line of [
      { quantity: 0, unitMinor: 1, discountMinor: 0 },
      { quantity: 1, unitMinor: 1, discountMinor: 2 },
      { quantity: 10000, unitMinor: 999999999999, discountMinor: 0 },
      { quantity: 1.5, unitMinor: 1, discountMinor: 0 },
    ])
      expect(() => invoiceTotals([{ description: "Fee", ...line }])).toThrow();
    expect(() => invoiceTotals([])).toThrow();
  });
  it("keeps large summary amounts exact and honors accounting exponents", () => {
    expect(exactMoney("900719925474099301", "PKR", "en-PK")).toContain(
      "9,007,199,254,740,993.01",
    );
    expect(exactMoney("123", "JPY", "en-US")).toContain("123");
    expect(exactMoney("1234", "BHD", "en-US")).toContain("1.234");
    expect(() => exactMoney("-1", "PKR")).toThrow();
  });
  it("distinguishes due today, overdue, drafts and no-balance charges", () => {
    const i = { status: "issued", balanceMinor: "100", dueOn: "2026-11-21" };
    expect(invoiceStatus(i, "2026-11-21")).toBe("Outstanding");
    expect(invoiceStatus(i, "2026-11-22")).toBe("Overdue");
    expect(invoiceStatus({ ...i, status: "draft" }, "2026-11-22")).toBe(
      "Draft",
    );
    expect(invoiceStatus({ ...i, balanceMinor: "0" }, "2026-11-22")).toBe(
      "No balance",
    );
  });
  it("labels actual partial and fully settled invoices without claiming payment on free charges", () => {
    const i = {
      status: "issued",
      balanceMinor: "500",
      totalMinor: "1000",
      dueOn: "2026-11-21",
    };
    expect(invoiceStatus(i, "2026-11-21")).toBe("Partially paid");
    expect(invoiceStatus({ ...i, balanceMinor: "0" }, "2026-11-21")).toBe(
      "Paid",
    );
    expect(
      invoiceStatus({ ...i, balanceMinor: "0", totalMinor: "0" }, "2026-11-21"),
    ).toBe("No balance");
    expect(invoiceStatus(i, "2026-11-22")).toBe("Overdue");
  });
  it("rejects unsupported filters and reversed date ranges", () => {
    expect(invoiceQuery.safeParse({ sort: "raw SQL" }).success).toBe(false);
    expect(
      invoiceQuery.safeParse({ from: "2026-11-22", to: "2026-11-21" }).success,
    ).toBe(false);
    expect(invoiceQuery.safeParse({ from: "2026-02-30" }).success).toBe(false);
  });
});
