import { describe, it, expect } from "vitest";
import { can } from "../../src/server/security/permissions";
describe("documented role permissions", () => {
  it("limits finance corrections and staff administration to owner", () => {
    for (const role of [
      "manager",
      "receptionist",
      "trainer",
      "accountant",
    ] as const) {
      expect(can(role, "billing.adjust")).toBe(false);
      expect(can(role, "staff.manage")).toBe(false);
    }
    expect(can("owner", "billing.adjust")).toBe(true);
  });
  it("allows reception collection and renewal but not plan/staff configuration", () => {
    expect(can("receptionist", "billing.collect")).toBe(true);
    expect(can("receptionist", "memberships.manage")).toBe(true);
    expect(can("receptionist", "plans.manage")).toBe(false);
  });
  it("keeps trainers out of gym-wide operations", () => {
    for (const action of [
      "members.manage",
      "billing.collect",
      "reports.financial",
      "attendance.manage",
    ] as const)
      expect(can("trainer", action)).toBe(false);
    expect(can("trainer", "trainer.own.read")).toBe(true);
  });
  it("allows accountant finance without operational overrides", () => {
    expect(can("accountant", "expenses.manage")).toBe(true);
    expect(can("accountant", "reports.financial")).toBe(true);
    expect(can("accountant", "memberships.override")).toBe(false);
  });
});
