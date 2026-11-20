import { it, expect } from "vitest";
import { trustedOrigins } from "../../src/lib/origins";
it("permits exact same-port loopback aliases only when explicitly enabled", () => {
  expect(trustedOrigins("http://localhost:3000", true)).toEqual([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  expect(trustedOrigins("http://127.0.0.1:3100", true)).toEqual([
    "http://127.0.0.1:3100",
    "http://localhost:3100",
  ]);
  expect(trustedOrigins("http://localhost:3000")).toEqual([
    "http://localhost:3000",
  ]);
  expect(trustedOrigins("https://gym.example", true)).toEqual([
    "https://gym.example",
  ]);
});
