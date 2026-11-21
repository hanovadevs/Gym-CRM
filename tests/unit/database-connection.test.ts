import { describe, it, expect } from "vitest";
import { databaseConnection } from "../../scripts/database-connection.mjs";
describe("database transport boundary", () => {
  it("keeps local PostgreSQL configuration unchanged", () => {
    expect(
      databaseConnection("postgresql://runtime:fixture@localhost/GYM"),
    ).toEqual({
      connectionString: "postgresql://runtime:fixture@localhost/GYM",
    });
  });
  it("cannot disable hosted certificate verification with URL parameters", () => {
    const v = databaseConnection(
      "postgresql://runtime:fixture@db.example.invalid/postgres?sslmode=disable",
    );
    expect(v.ssl).toEqual({ rejectUnauthorized: true });
    expect(v.connectionString).not.toContain("sslmode");
  });
  it("rejects non-certificate configuration before connecting", () => {
    expect(() =>
      databaseConnection(
        "postgresql://runtime:fixture@db.example.invalid/postgres",
        Buffer.from("<html>Not a certificate</html>").toString("base64"),
      ),
    ).toThrow("CA configuration");
  });
});
