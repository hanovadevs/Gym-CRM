import { test, expect } from "@playwright/test";
import pg from "pg";
import { securityFixture } from "../helpers/security-fixture";
import { configureAuth } from "../../src/server/auth/configure";
import type { Page } from "@playwright/test";
const admin = new pg.Client({
    connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
  }),
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let f: Awaited<ReturnType<typeof securityFixture>>,
  cookies: { name: string; value: string }[] = [];
test.beforeAll(async () => {
  await admin.connect();
  f = await securityFixture(
    admin,
    process.env.BETTER_AUTH_SECRET!,
    "http://127.0.0.1:3100",
  );
  const auth = configureAuth(pool, {
      secret: process.env.BETTER_AUTH_SECRET!,
      baseURL: "http://127.0.0.1:3100",
      sendReset: async () => {},
    }),
    u = f.users["Owner A"],
    r = await auth.api.signInEmail({
      body: { email: u.email, password: u.password },
      asResponse: true,
    });
  cookies = r.headers.getSetCookie().map((s) => {
    const p = s.split(";")[0],
      i = p.indexOf("=");
    return { name: p.slice(0, i), value: p.slice(i + 1) };
  });
});
test.afterAll(async () => {
  if (f) await f.cleanup();
  await admin.end();
  await pool.end();
});
async function session(page: Page) {
  await page.context().addCookies(
    cookies.map((c) => ({
      ...c,
      url: "http://127.0.0.1:3100",
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
  );
  await page.goto("/workspace?organizationId=" + f.orgA);
  await expect(
    page.getByRole("heading", { name: "Welcome, Owner A", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", {
    name: (page.viewportSize()?.width ?? 1280) <= 960
      ? "Menu"
      : /^(Collapse|Expand) navigation$/,
    exact: true,
  })).toBeEnabled();
}
test("desktop icon navigation collapses, persists on reload and follows real routes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await session(page);
  const sidebar = page.locator(".app-sidebar");
  await expect(sidebar).toHaveAttribute("data-collapsed", "false");
  await expect.poll(async () => page.evaluate(() => {
    const nav = document.querySelector(".app-sidebar")!.getBoundingClientRect();
    const content = document.querySelector(".settings-content")!.getBoundingClientRect();
    return content.left >= nav.right;
  })).toBe(true);
  await page.screenshot({
    path: "test-results/sidebar-expanded-1440.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Collapse navigation", exact: true })
    .click();
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  await expect(sidebar).toHaveCSS("width", "84px");
  await expect.poll(async () => page.evaluate(() => {
    const nav = document.querySelector(".app-sidebar")!.getBoundingClientRect();
    const content = document.querySelector(".settings-content")!.getBoundingClientRect();
    return content.left >= nav.right;
  })).toBe(true);
  await expect(
    page.getByRole("button", { name: "Expand navigation", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  await sidebar.getByRole("link", { name: "Plans", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Membership plans", exact: true }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("link", { name: "Plans", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(sidebar).toHaveCSS("width", "84px");
  await page.screenshot({
    path: "test-results/sidebar-collapsed-1440.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Expand navigation", exact: true })
    .click();
  await expect(sidebar).toHaveAttribute("data-collapsed", "false");
  await expect.poll(async () => page.evaluate(() => {
    const nav = document.querySelector(".app-sidebar")!.getBoundingClientRect();
    const content = document.querySelector(".settings-content")!.getBoundingClientRect();
    return content.left >= nav.right;
  })).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("mobile navigation traps focus, closes with Escape and returns focus to Menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await session(page);
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  const dialog = page.getByRole("dialog", { name: "Navigation", exact: true });
  await expect(dialog).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(
    dialog.getByRole("link", { name: "Members", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.screenshot({ path: "test-results/sidebar-mobile-390.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Members", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Members", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
