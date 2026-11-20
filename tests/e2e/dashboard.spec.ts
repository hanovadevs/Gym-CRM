import { expect, test } from "@playwright/test";
for (const width of [390, 768, 1280, 1440])
  test(`dashboard at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Good afternoon, Ali" }),
    ).toBeVisible();
    await expect(page.getByText("Demo data", { exact: true })).toHaveCount(0);
    // Exercise React before screenshots alter caret styles during hydration.
    await page.getByRole("searchbox").fill("zzz");
    await expect(page.getByRole("status")).toContainText("No members");
    await page.getByRole("searchbox").fill("");
    await expect(
      page.getByRole("button", { name: /Sara Ahmed/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/dashboard-${width}.png`,
      fullPage: true,
    });
  });
test("fixture lookup, drawer keyboard and chart period", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("searchbox").fill("zzz");
  await expect(page.getByRole("status")).toContainText("No members");
  await page.getByRole("searchbox").fill("Sara");
  await page.getByRole("button", { name: /Sara Ahmed/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Sara Ahmed/ })).toBeFocused();
  await page.getByLabel("Activity period").selectOption("Last week");
  await expect(page.getByRole("img")).toHaveAccessibleName(/Sunday 82/);
  await page
    .getByRole("button", { name: "Add member", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Registration unavailable" }),
  ).toBeDisabled();
});

test("mobile navigation, modal focus trap and clean browser runtime", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("link", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Members", exact: true }),
  ).toBeDisabled();
  await menu.click();
  await page
    .getByRole("button", { name: "Add member", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Add member", exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
  ).toBeTruthy();
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
  ).toBeTruthy();
  await page.screenshot({ path: "test-results/drawer-390.png" });
  await page.getByRole("button", { name: "Close drawer" }).click();
  await expect(
    page.getByRole("button", { name: "Add member", exact: true }).first(),
  ).toBeFocused();
  expect(errors).toEqual([]);
});

test("section info buttons work with keyboard and contain useful explanations", async ({
  page,
}) => {
  await page.goto("/dashboard");
  const controls = page.getByRole("button", { name: /^About / });
  await expect(controls).toHaveCount(9);
  for (const control of await controls.all()) {
    await control.focus();
    await page.keyboard.press("Enter");
    const popover = page.locator(".info-popover:popover-open");
    await expect(popover).toBeVisible();
    expect((await popover.innerText()).length).toBeGreaterThan(60);
    await page.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);
  }
  await expect(page.locator("body")).not.toContainText(/demo/i);
});
