import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";

const captureRoot = path.resolve(`../captures/${process.env.EVIDENCE_PHASE ?? "candidate"}`);

async function openPortland(page: Page) {
  await page.goto("/?q=Portland");
  const oregon = page.locator(".place-result").filter({ hasText: "Oregon" }).first();
  await expect(oregon).toContainText("United States");
  await oregon.click();
  await expect(page.locator("h1")).toContainText("Portland");
  await expect(page.locator(".winner-row")).toBeVisible();
}

test.describe("Aperture Hours production candidate", () => {
  test("home, live reading, save, clean-browser read, and deletion", async ({ page, browser, browserName }) => {
    test.skip(browserName !== "chromium", "The consequential journey runs once; cross-browser coverage is separate.");
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.locator(".motion-button")).toBeFocused();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(captureRoot, "01-home-1440.png"), fullPage: true });

    await openPortland(page);
    await expect(page.locator(".window-row")).toHaveCount(await page.locator(".window-row").count());
    expect(await page.locator(".window-row").count()).toBeGreaterThan(4);
    await page.screenshot({ path: path.join(captureRoot, "02-reading-1280.png"), fullPage: true });

    const activity = page.locator("#activity");
    await activity.selectOption("architecture");
    await expect(page).toHaveURL(/activity=architecture/);
    await expect(page.locator("[aria-live='polite']")).toContainText(/daylight windows updated|No qualifying daylight/);
    await expect(activity).toBeFocused();
    await page.locator(".activity-criteria summary").click();
    await expect(page.locator(".criteria-copy")).toContainText("Facade orientation and obstruction are not modeled");

    const saveHref = await page.locator("a", { hasText: "Review before saving" }).getAttribute("href");
    expect(saveHref).toBeTruthy();
    await page.goto(saveHref!);
    await expect(page.locator("h1")).toHaveText("Save this plan.");
    await page.screenshot({ path: path.join(captureRoot, "03-save-disclosures-1280.png"), fullPage: true });
    await page.getByRole("button", { name: "Save plan and get link" }).click();
    await expect(page.locator(".save-success")).toContainText("Deletion secret · shown once");
    await expect(page.locator(".save-success")).toBeFocused();
    const shareUrl = await page.locator(".secret-output input").inputValue();
    expect(shareUrl).toMatch(/\/plans\/[A-Za-z0-9_-]{32}$/);
    await page.getByRole("link", { name: "Open saved plan" }).click();
    await expect(page.getByRole("link", { name: "Delete this plan" })).toBeVisible();
    await page.screenshot({ path: path.join(captureRoot, "04-shared-authority-present.png"), fullPage: true });

    const clean = await browser.newContext();
    const cleanPage = await clean.newPage();
    await cleanPage.goto(shareUrl);
    await expect(cleanPage.getByText("Self-service deletion is unavailable here.")).toBeVisible();
    await expect(cleanPage.getByRole("link", { name: "Delete this plan" })).toHaveCount(0);
    await cleanPage.screenshot({ path: path.join(captureRoot, "05-lost-authority.png"), fullPage: true });
    await clean.close();

    await page.getByRole("link", { name: "Delete this plan" }).click();
    await expect(page.locator("h1")).toContainText("Delete this plan permanently?");
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.locator("h1")).toHaveText("Plan deleted.");
    const unavailable = await page.request.get(shareUrl);
    expect(unavailable.status()).toBe(404);
  });

  test("responsive containment, motion override, metadata, and accessibility", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openPortland(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
    await page.screenshot({ path: path.join(captureRoot, "06-reading-320.png"), fullPage: true });
    const motion = page.locator(".motion-button");
    await motion.click();
    await expect(motion).toHaveAttribute("aria-pressed", "false");
    await page.reload();
    await expect(page.locator(".motion-button")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("link[rel='icon']")).toHaveAttribute("href", "/icon.svg");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("method and privacy preserve contact and content without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    for (const route of ["/method", "/privacy", "/does-not-exist"]) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(route === "/does-not-exist" ? 404 : 200);
      await expect(page.locator(`a[href="https://github.com/gitjndmx/aperture-hours/issues"]`).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    }
    await expect(page.locator("h1")).toContainText("That page does not exist");
    await context.close();
  });
});
