import { describe, it, expect } from "vitest";
import {
  createMember,
  normalizePhone,
  localToday,
} from "../../src/modules/members/schemas";
const base = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  registrationKey: "22222222-2222-4222-8222-222222222222",
  homeBranchId: "33333333-3333-4333-8333-333333333333",
  name: "سارا احمد",
  joinedOn: "2024-02-29",
  phone: "",
  email: "Member@Example.com",
};
describe("member registration rules", () => {
  it("accepts an email-only Unicode name and normalizes contact without assuming country", () => {
    expect(createMember.parse(base).email).toBe("member@example.com");
    expect(normalizePhone("+92 (300) 123-4567")).toBe("923001234567");
  });
  it("rejects unusable contacts, impossible dates, unsafe text and unconfirmed shared contact reasons", () => {
    for (const change of [
      { email: "" },
      { phone: "call me", email: "" },
      { phone: "123", email: "" },
      { joinedOn: "2025-02-29" },
      { name: "Bad\u0000Name" },
      { acknowledgeDuplicate: true, duplicateReason: "" },
      { role: "owner" },
    ])
      expect(createMember.safeParse({ ...base, ...change }).success).toBe(
        false,
      );
  });
  it("derives joining-day defaults at gym-local midnight instead of the UTC date", () => {
    expect(localToday("Asia/Karachi", new Date("2026-11-20T19:01:00Z"))).toBe(
      "2026-11-21",
    );
    expect(
      localToday("America/Los_Angeles", new Date("2026-11-20T01:00:00Z")),
    ).toBe("2026-11-19");
  });
});
