import { describe, it, expect } from "vitest";
import {
  status,
  eligibility,
  daysBetween,
  effectiveEnd,
} from "../../src/modules/memberships/state";
import type { Membership } from "../../src/modules/memberships/types";
const m = {
  id: "m",
  startOn: "2026-11-01",
  endOn: "2026-12-01",
  originalEndOn: "2026-12-01",
  lifecycle: "active",
  activatedAt: "2026-11-01T00:00:00Z",
  cancelledEffectiveOn: null,
  freezes: [],
  invoice: { totalMinor: 450000, dueOn: "2026-11-01" },
} as unknown as Membership;
describe("membership state and policy", () => {
  it("keeps pending activation separate from dates, and honors exact exclusive ends", () => {
    expect(
      status({ ...m, activatedAt: null, lifecycle: "pending" }, "2026-11-20"),
    ).toBe("Pending activation");
    expect(
      eligibility([{ ...m, activatedAt: null }], "2026-11-20", false, 0, false)
        .reason,
    ).toBe("pending_activation");
    expect(eligibility([m], "2026-12-01", false, 0, false).reason).toBe(
      "expired",
    );
    expect(eligibility([m], "2026-11-30", false, 0, false).allowed).toBe(true);
  });
  it("applies configured grace without altering the actual term", () => {
    expect(eligibility([m], "2026-12-02", false, 3, false)).toEqual({
      allowed: true,
      reason: "grace",
    });
    expect(eligibility([m], "2026-12-04", false, 3, false).allowed).toBe(false);
    expect(m.endOn).toBe("2026-12-01");
    expect(
      eligibility(
        [
          m,
          {
            ...m,
            startOn: "2026-12-01",
            endOn: "2027-01-01",
            lifecycle: "pending",
            activatedAt: null,
          },
        ],
        "2026-12-02",
        false,
        3,
        false,
      ),
    ).toEqual({ allowed: true, reason: "grace" });
  });
  it("gives archive and freeze denial priority and treats resume as exclusive", () => {
    const frozen = {
      ...m,
      freezes: [
        { startOn: "2026-11-20", endOn: "2026-11-23", reversedAt: null },
      ],
    } as Membership;
    expect(eligibility([frozen], "2026-11-20", true, 0, false).reason).toBe(
      "archived",
    );
    expect(status(frozen, "2026-11-21")).toBe("Frozen");
    expect(eligibility([frozen], "2026-11-23", false, 0, false).allowed).toBe(
      true,
    );
    expect(eligibility([frozen], "2026-11-22", false, 0, false).reason).toBe(
      "frozen",
    );
  });
  it("separates due debt blocking from activation and future-due invoices", () => {
    expect(eligibility([m], "2026-11-20", false, 0, true).reason).toBe(
      "debt_blocked",
    );
    expect(
      eligibility(
        [{ ...m, invoice: { ...m.invoice, dueOn: "2026-11-21" } }],
        "2026-11-20",
        false,
        0,
        true,
      ).allowed,
    ).toBe(true);
  });
  it("stops at the effective cancellation day and preserves historical ranges", () => {
    const c = {
      ...m,
      lifecycle: "cancelled",
      cancelledEffectiveOn: "2026-11-22",
    } as Membership;
    expect(status(c, "2026-11-21")).toBe("Cancellation scheduled");
    expect(eligibility([c], "2026-11-21", false, 30, false).allowed).toBe(true);
    expect(eligibility([c], "2026-11-22", false, 30, false).reason).toBe(
      "cancelled",
    );
    expect(effectiveEnd({ ...c, startOn: "2026-11-25" })).toBe("2026-11-25");
  });
  it("uses calendar days through DST/leap boundaries", () => {
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-03-07", "2026-03-10")).toBe(3);
  });
});
