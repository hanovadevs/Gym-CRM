import { expect, test } from "@playwright/test";
for (const width of [390, 768, 1280, 1440])
  test(`former preview is protected at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(
      page.getByRole("heading", { name: "Welcome back", exact: true }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      /Good afternoon, Ali|Crown Fitness|286,500|Demo data/,
    );
  });
test("root opens the protected dashboard", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("link", { name: "Mojym", exact: true }),
  ).toBeVisible();
});
