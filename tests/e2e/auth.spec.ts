import { test, expect } from "@playwright/test";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { bootstrapOwner } from "../../src/server/auth/bootstrap";
const email = `browser-${randomBytes(6).toString("hex")}@example.invalid`,
  password = randomBytes(20).toString("hex");
let owner: { userId: string; organizationId: string } | undefined;
const db = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
test.beforeAll(async () => {
  await db.connect();
  owner = await bootstrapOwner(
    db,
    {
      name: "Browser Owner",
      email,
      password,
      gymName: "Browser Test",
      slug: "browser-test",
    },
    {
      secret: process.env.BETTER_AUTH_SECRET!,
      baseURL: "http://127.0.0.1:3100",
    },
  );
});
test.afterAll(async () => {
  if (owner) {
    await db.query("delete from app_auth.mail_outbox where auth_user_id=$1",[owner.userId]);
    await db.query(
      "delete from gym.staff_branch_grants where organization_id=$1",
      [owner.organizationId],
    );
    await db.query(
      "delete from gym.staff_memberships where organization_id=$1",
      [owner.organizationId],
    );
    await db.query("delete from gym.branches where organization_id=$1", [
      owner.organizationId,
    ]);
    await db.query("delete from gym.audit_events where organization_id=$1", [
      owner.organizationId,
    ]);
    await db.query("delete from gym.organizations where id=$1", [
      owner.organizationId,
    ]);
    await db.query('delete from app_auth."user" where id=$1', [owner.userId]);
  }
  await db.end();
});
test("real staff login persists across reload and logout revokes access", async ({
  page,
}) => {
  test.setTimeout(60000);
  // Browser uses the loopback alias while the test server is configured for 127.0.0.1.
  await page.goto("http://localhost:3100/workspace");
  await expect(page).toHaveURL(/sign-in/);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const loginResponse = page.waitForResponse((r) =>
    r.url().includes("/api/auth/sign-in/email"),
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await loginResponse).status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Gym overview" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Gym overview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/sign-in/);
  test.setTimeout(60000);
  await page.goto("/workspace");
  await expect(page).toHaveURL(/sign-in/);
  const response = await page.request.post("/api/auth/sign-up/email", {
    data: { name: "Intruder", email: "not-allowed@example.invalid", password },
  });
  expect(response.status()).toBe(400);
});
test("sign-in honors the server retry countdown and preserves credentials", async ({
  page,
}) => {
  await page.goto("/sign-in");
  let attempts = 0;
  await page.route("**/api/auth/sign-in/email", (route) => {
    attempts++;
    return route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: { "X-Retry-After": "2" },
      body: JSON.stringify({ message: "Too many requests" }),
    });
  });
  await page
    .getByLabel("Work email", { exact: true })
    .fill("cooldown@example.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Fictional test password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Try again in/ }),
  ).toBeDisabled();
  await expect(page.getByLabel("Work email", { exact: true })).toHaveValue(
    "cooldown@example.invalid",
  );
  await page.getByLabel("Password", { exact: true }).press("Enter");
  expect(attempts).toBe(1);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled({ timeout: 5000 });
  expect(attempts).toBe(1);
});
for (const width of [390, 768, 1280, 1440])
  test(`sign-in visual ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/sign-in");
    await page.getByLabel("Work email").fill("");
    await page.getByRole("button", { name: "Show", exact: true }).click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
      "type",
      "text",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/sign-in-${width}.png`,
      fullPage: true,
    });
  });

test("local password recovery completes through the browser", async ({
  page,
}) => {
  test.setTimeout(60000);
  const { readdir, readFile, unlink } = await import("node:fs/promises");
  await page.goto("/forgot-password");
  await page.getByLabel("Work email").fill(email);
  await page
    .getByRole("button", { name: "Request reset instructions" })
    .click();
  await expect(page.getByRole("status")).toContainText("If an account exists", {
    timeout: 20000,
  });
  const files = await readdir(".local/mail");
  let mail: { url: string } | undefined;
  let path = "";
  for (const file of files) {
    const candidate = JSON.parse(await readFile(".local/mail/" + file, "utf8"));
    if (candidate.email === email) {
      mail = candidate;
      path = ".local/mail/" + file;
      break;
    }
  }
  expect(Boolean(mail)).toBeTruthy();
  if (!mail) throw new Error("Recovery capture missing");
  try {
    await page.goto(mail.url);
    await page
      .getByLabel("New password", { exact: true })
      .fill(password + "new");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("status")).toContainText("Password updated");
  } finally {
    await unlink(path);
  }
});
