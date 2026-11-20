import { test, expect } from "@playwright/test";
import pg from "pg";
import { securityFixture } from "../helpers/security-fixture";
const db = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
let f: Awaited<ReturnType<typeof securityFixture>>;
test.beforeAll(async () => {
  await db.connect();
  f = await securityFixture(
    db,
    process.env.BETTER_AUTH_SECRET!,
    "http://127.0.0.1:3100",
  );
});
test.afterAll(async () => {
  if (f) await f.cleanup();
  await db.end();
});
async function signIn(page: import("@playwright/test").Page, name: string) {
  const user = f.users[name];
  const response = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { email: user.email, password: user.password },
  });
  expect(response.status()).toBe(200);
}
test("unauthenticated API, owner branch scope and forged selections", async ({
  page,
}) => {
  test.setTimeout(60000);
  expect((await page.request.get("/api/workspace")).status()).toBe(401);
  await signIn(page, "Owner A");
  const response = await page.request.get("/api/workspace");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const data = (await response.json()).data;
  expect(data.branches).toHaveLength(2);
  expect(data.organizations).toHaveLength(1);
  expect(JSON.stringify(data)).not.toContain("Scope Gym B");
  for (const suffix of [`organizationId=${f.orgB}`, `branchId=${f.b1}`]) {
    const result = await page.request.get("/api/workspace?" + suffix);
    expect(result.status()).toBe(404);
    expect(await result.text()).not.toContain("Private B");
  }
  expect((await page.request.get("/api/workspace?role=owner")).status()).toBe(
    422,
  );
  expect(
    (
      await page.request.post("/api/workspace", { data: { role: "owner" } })
    ).status(),
  ).toBe(405);
  await page.goto("/workspace");
  await expect(
    page.getByRole("heading", { name: "Welcome, Owner A" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Branch scope", exact: true })
    .selectOption(f.a2);
  await page.getByRole("button", { name: "Apply branch" }).click();
  await page.waitForURL((url) => url.searchParams.get("branchId") === f.a2);
  await expect(page.locator(".branch-list")).toContainText("North");
  await expect(page.locator(".branch-list")).not.toContainText("Central");
  await page
    .getByRole("combobox", { name: "Branch scope", exact: true })
    .selectOption("");
  await page.getByRole("button", { name: "Apply branch" }).click();
  await page.waitForURL((url) => url.searchParams.get("branchId") === "");
  await expect(page.locator(".branch-list li")).toHaveCount(2);
  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Welcome, Owner A" }),
    ).toBeVisible();
    await expect(page.locator(".branch-list li")).toHaveCount(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/workspace-${width}.png`,
      fullPage: true,
    });
  }
});
test("reception has assigned branch only and revoked staff loses live session access", async ({
  page,
}) => {
  await signIn(page, "Reception A");
  const response = await page.request.get("/api/workspace");
  const data = (await response.json()).data;
  expect(data.role).toBe("receptionist");
  expect(data.branches.map((b: { id: string }) => b.id)).toEqual([f.a1]);
  expect(data.actions).not.toContain("staff.manage");
  expect(data.actions).not.toContain("billing.adjust");
  expect(
    (await page.request.get("/api/workspace?branchId=" + f.a2)).status(),
  ).toBe(404);
  await page.goto("/workspace");
  await expect(
    page.getByRole("combobox", { name: "Branch scope", exact: true }),
  ).toHaveCount(0);
  await db.query("update gym.staff_memberships set active=false where id=$1", [
    f.memberships.reception,
  ]);
  expect((await page.request.get("/api/workspace")).status()).toBe(403);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Access unavailable" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/workspace-forbidden.png",
    fullPage: true,
  });
});
test("multi-gym selection works without cross-branch leakage", async ({
  page,
}) => {
  await signIn(page, "Shared Staff");
  await page.goto("/workspace");
  await page.getByLabel("Gym workspace").selectOption(f.orgB);
  await page.getByRole("button", { name: "Switch workspace" }).click();
  await expect(page.locator(".branch-list")).toContainText("Private B");
  await expect(page.locator(".branch-list")).not.toContainText("Central");
  const response = await page.request.get(
    "/api/workspace?organizationId=" + f.orgB,
  );
  expect((await response.json()).data.organization.id).toBe(f.orgB);
  await db.query(
    "delete from gym.staff_branch_grants where staff_membership_id=$1",
    [f.memberships.sharedA],
  );
  await page.goto("/workspace");
  await expect(page.locator(".branch-list")).toContainText("Private B");
  await expect(page.getByLabel("Gym workspace")).toHaveCount(0);
});
