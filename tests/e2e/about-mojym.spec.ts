import { test, expect } from "@playwright/test";

test("visitors can explore Mojym and return to sign in", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sign-in");
  const register = page.getByRole("link", {
    name: "Register your gym on WhatsApp",
  });
  await expect(register).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/19177355385\?text=/,
  );
  await page.getByRole("link", { name: "Explore the gym CRM" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(
    page.getByRole("link", {
      name: "Read the full Mojym guide on Hanova Devs",
    }),
  ).toHaveAttribute(
    "href",
    "https://www.hanovadevs.com/products/mojym/how-to-use",
  );
  await expect(
    page.getByRole("heading", { name: "How to use Mojym" }),
  ).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  for (const image of await page.locator("main img").all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
  }
  await page.getByRole("link", { name: "Back to sign in" }).first().click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
