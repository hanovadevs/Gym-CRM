import { describe, it, expect } from "vitest";
import {
  updateSettings,
  createStaff,
  branchWrite,
} from "../../src/modules/settings/schemas";
const organizationId = "11111111-1111-4111-8111-111111111111";
describe("settings form boundaries", () => {
  it("rejects invalid time zones, locale tags, unsafe policy values and unknown fields", () => {
    for (const changes of [
      { timeZone: "Mars/Unknown" },
      { locale: "bad_locale" },
      { graceDays: -1 },
      { graceDays: 31 },
      { currency: "ZZZ" },
      { role: "owner" },
    ])
      expect(
        updateSettings.safeParse({
          organizationId,
          version: 1,
          changes,
          reason: "Invalid input",
        }).success,
      ).toBe(false);
  });
  it("requires a stale-write version and a meaningful reason", () => {
    expect(
      updateSettings.safeParse({
        organizationId,
        changes: { name: "Gym" },
        reason: "   ",
      }).success,
    ).toBe(false);
    expect(
      updateSettings.safeParse({
        organizationId,
        version: 1,
        changes: {},
        reason: "No edits",
      }).success,
    ).toBe(false);
  });
  it("rejects duplicate branch grants and mismatched branch versions", () => {
    expect(
      createStaff.safeParse({
        organizationId,
        name: "Staff",
        email: "staff@example.invalid",
        password: "a".repeat(20),
        role: "receptionist",
        active: true,
        branchIds: [organizationId, organizationId],
        reason: "Duplicate grants",
      }).success,
    ).toBe(false);
    expect(
      branchWrite.safeParse({
        organizationId,
        id: organizationId,
        name: "Branch",
        code: "MAIN",
        active: true,
        reason: "Missing version",
      }).success,
    ).toBe(false);
  });
});
