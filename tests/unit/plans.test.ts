import { describe, it, expect } from "vitest";
import {
  endOn,
  previousDay,
  parseAmount,
  amountInput,
  todayInZone,
} from "../../src/modules/plans/format";
import { versionFields } from "../../src/modules/plans/schemas";
describe("plan calendar contracts", () => {
  it("uses the gym calendar day across UTC boundaries", () => {
    const now = new Date("2026-11-20T23:30:00Z");
    expect(todayInZone("Asia/Karachi", now)).toBe("2026-11-21");
    expect(todayInZone("America/Los_Angeles", now)).toBe("2026-11-20");
  });
  it("distinguishes month-end calendar terms from fixed days", () => {
    expect(endOn("2027-01-31", 1, "months")).toBe("2027-02-28");
    expect(previousDay(endOn("2027-01-31", 1, "months"))).toBe("2027-02-27");
    expect(endOn("2027-01-31", 30, "days")).toBe("2027-03-02");
  });
  it("clamps leap years, handles year boundaries and rejects invalid dates/ranges", () => {
    expect(endOn("2028-01-31", 1, "months")).toBe("2028-02-29");
    expect(endOn("2028-02-29", 12, "months")).toBe("2029-02-28");
    expect(endOn("2026-12-31", 2, "months")).toBe("2027-02-28");
    expect(() => endOn("2027-02-29", 1, "months")).toThrow();
    expect(() => endOn("9999-12-31", 1, "days")).toThrow();
    expect(() => endOn("2027-01-01", 0, "days")).toThrow();
  });
});
describe("exact currency parsing", () => {
  it("parses decimal strings without floating arithmetic", () => {
    expect(parseAmount("4500.01", "PKR")).toBe(450001);
    expect(parseAmount("0.29", "PKR")).toBe(29);
    expect(parseAmount("9999999999.99", "PKR")).toBe(999999999999);
    expect(amountInput(450001, "PKR")).toBe("4500.01");
  });
  it("honors zero and three-digit currencies", () => {
    expect(parseAmount("500", "JPY")).toBe(500);
    expect(() => parseAmount("500.00", "JPY")).toThrow();
    expect(parseAmount("1.234", "BHD")).toBe(1234);
  });
  it("rejects negatives, rounding, exponent notation and unsafe amounts", () => {
    for (const s of ["-1", "1e3", "NaN", "1,000", "1.001", "10000000000.00"])
      expect(() => parseAmount(s, "PKR")).toThrow();
  });
  it("requires a bounded term and at least one benefit", () => {
    const v = {
      name: "Basic",
      amountMinor: 0,
      currency: "PKR",
      durationUnit: "months",
      durationCount: 1,
      accessMode: "home_branch",
      gymFloor: true,
      classes: false,
      personalTraining: false,
    };
    expect(versionFields.safeParse(v).success).toBe(true);
    expect(versionFields.safeParse({ ...v, durationCount: 121 }).success).toBe(
      false,
    );
    expect(versionFields.safeParse({ ...v, gymFloor: false }).success).toBe(
      false,
    );
  });
});
