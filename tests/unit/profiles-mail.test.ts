import { it, expect } from "vitest";
import {
  addNote,
  saveEmergency,
} from "../../src/modules/members/profile-schemas";
import { mailConfig, SYSTEM_SENDER } from "../../src/server/mail/config";
const base = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  id: "22222222-2222-4222-8222-222222222222",
};
it("bounds note visibility/content and validates complete emergency contacts", () => {
  expect(
    addNote.safeParse({
      ...base,
      requestKey: base.id,
      visibility: "public",
      body: "Note",
    }).success,
  ).toBe(false);
  expect(
    addNote.safeParse({
      ...base,
      requestKey: base.id,
      visibility: "operational",
      body: "Bad\0data",
    }).success,
  ).toBe(false);
  expect(
    addNote.safeParse({
      ...base,
      requestKey: base.id,
      visibility: "operational",
      body: "Line one\nLine two",
    }).success,
  ).toBe(true);
  expect(
    saveEmergency.safeParse({
      ...base,
      version: 1,
      reason: "Edit",
      contact: { name: "Family", phone: "", relationship: "Sibling" },
    }).success,
  ).toBe(false);
});
it("fixes SMTP sender identity and forbids capture in production", () => {
  expect(SYSTEM_SENDER).toBe("contact@hanovadevs.com");
  expect(mailConfig({ MAIL_TRANSPORT: "capture", APP_ENV: "test" }).mode).toBe(
    "capture",
  );
  expect(() =>
    mailConfig({ MAIL_TRANSPORT: "capture", NODE_ENV: "production" }),
  ).toThrow();
  expect(() =>
    mailConfig({
      MAIL_TRANSPORT: "smtp",
      SMTP_USERNAME: "tenant@example.invalid",
    }),
  ).toThrow();
});
