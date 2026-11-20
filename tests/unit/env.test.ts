import { describe, it, expect } from "vitest";
import { readEnvironment } from "../../src/lib/env";
const valid = {
  APP_URL: "http://localhost:3000",
  DEMO_MODE: "true",
  DATABASE_URL: "postgresql://restricted:secret@localhost/GYM",
  BETTER_AUTH_SECRET: "a".repeat(48),
};
describe("configuration boundary", () => {
  it("rejects fixture mode in production", () =>
    expect(() => readEnvironment({ ...valid, APP_ENV: "production" })).toThrow(
      "forbidden",
    ));
  it("reports field names without secret values", () => {
    expect(() =>
      readEnvironment({ ...valid, DATABASE_URL: "sensitive-value" }),
    ).toThrow("DATABASE_URL");
    expect(() =>
      readEnvironment({ ...valid, DATABASE_URL: "sensitive-value" }),
    ).not.toThrow("sensitive-value");
  });
  it("also rejects Next production mode", () =>
    expect(() => readEnvironment({ ...valid, NODE_ENV: "production" })).toThrow(
      "forbidden",
    ));
  it("requires explicit demo setting", () =>
    expect(() =>
      readEnvironment({ ...valid, DEMO_MODE: undefined }),
    ).toThrow());
});
