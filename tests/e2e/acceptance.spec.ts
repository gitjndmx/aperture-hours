import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const captureRoot = path.resolve(`../captures/${process.env.EVIDENCE_PHASE ?? "candidate"}`);
function deletionCookieNameForTest(id: string) { return `ah_delete_${id}`; }

async function openPortland(page: Page) {
  await page.goto("/?q=Portland");
  await page.locator(".place-result").filter({ hasText: "Oregon" }).first().click();
  await expect(page.locator(".winner-row")).toBeVisible();
}

async function saveFormValues(page: Page) {
  const href = await page.getByRole("link", { name: "Review before saving" }).getAttribute("href");
  await page.goto(href!);
  return page.locator("form.save-action").evaluate((form) => Object.fromEntries(new FormData(form as HTMLFormElement).entries()) as Record<string, string>);
}

test.describe("acceptance matrix", () => {
  test("a city navigation exposes a truthful pending state", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "The pending-state timing proof runs once.");
    await page.route("**/light/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await page.goto("/?q=Portland");
    const oregon = page.locator(".place-result").filter({ hasText: "Oregon" }).first();
    await oregon.click({ noWaitAfter: true });
    await expect(oregon.getByRole("status")).toHaveText("Reading forecast…");
    await expect(page.locator(".winner-row")).toBeVisible();
  });

  test("content survives every specified responsive boundary", async ({ page, browserName }) => {
    await openPortland(page);
    for (const width of [1440, 1280, 1160, 1159, 840, 839, 560, 559, 390, 320]) {
      await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
      await expect(page.locator(".winner-row")).toBeVisible();
      const geometry = await page.evaluate(() => {
        const root = document.documentElement;
        const parts = [...document.querySelectorAll<HTMLElement>(".winner-heading .clock-part")].map((item) => item.getBoundingClientRect());
        const duplicateIds = [...document.querySelectorAll<HTMLElement>("[id]")]
          .map((item) => item.id)
          .filter((id, index, all) => all.indexOf(id) !== index);
        return {
          overflow: root.scrollWidth - root.clientWidth,
          duplicateIds,
          clockInside: parts.length === 2 && parts.every((rect) => rect.left >= 0 && rect.right <= root.clientWidth),
          stripWidth: document.querySelector<HTMLElement>(".window-strip")?.getBoundingClientRect().width ?? 0
        };
      });
      expect(geometry.overflow, `${browserName} width ${width}`).toBe(0);
      expect(geometry.duplicateIds).toEqual([]);
      expect(geometry.clockInside).toBe(true);
      expect(geometry.stripWidth).toBeGreaterThanOrEqual(144);
      if (width > 840) await expect(page.locator(".evidence-disclosure")).toHaveAttribute("open", "");
      else await expect(page.locator(".evidence-disclosure")).not.toHaveAttribute("open", "");
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator("html").evaluate((node) => { (node as HTMLElement).style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.screenshot({ path: path.join(captureRoot, `${browserName}-text-scale-200.png`), fullPage: true });
  });

  test("motion defaults on despite OS preference and explicit off is complete", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPortland(page);
    const motion = page.locator(".motion-button");
    await expect(motion).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveClass(/motion-on/);
    await motion.click();
    await expect(page.locator("html")).toHaveClass(/motion-off/);
    await expect(motion).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => document.getAnimations().filter((item) => item.playState === "running").length)).toBe(0);
    await page.reload();
    await expect(motion).toHaveAttribute("aria-pressed", "true");
  });

  test("native disclosures, empty recommendation, and no-JavaScript path remain complete", async ({ browser, browserName }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const fixture = "/light/longyearbyen-svalbard-norway-2729907?id=2729907&name=Longyearbyen&region=Svalbard&country=Norway&latitude=78.2232&longitude=15.6469&timezone=Arctic%2FLongyearbyen&fixture=polar-night";
    const response = await page.goto(fixture);
    expect(response?.status()).toBe(200);
    await expect(page.getByText("No qualifying daylight window is available for this date.")).toBeVisible();
    await expect(page.locator(".window-row, .window-strip, .row-tier")).toHaveCount(0);
    await expect(page.locator(".evidence-table tbody tr")).toHaveCount(24);
    await page.locator(".activity-criteria summary").click();
    await expect(page.locator(".criteria-copy")).toContainText("Facade orientation and obstruction are not modeled");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.screenshot({ path: path.join(captureRoot, `${browserName}-nojs-empty-390.png`), fullPage: true });
    await context.close();
  });

  test("keyboard focus and newest-only result announcement survive rapid changes", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "The interruption trace runs once after cross-engine structural coverage.");
    await openPortland(page);
    const summary = page.locator(".activity-criteria summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".activity-criteria")).toHaveAttribute("open", "");
    await expect(summary).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator(".activity-criteria")).not.toHaveAttribute("open", "");
    await expect(summary).toBeFocused();

    await page.evaluate(() => {
      const live = document.querySelector("[aria-live='polite']")!;
      (window as typeof window & { acceptanceAnnouncements?: string[] }).acceptanceAnnouncements = [];
      new MutationObserver(() => {
        const text = live.textContent?.trim();
        if (text) (window as typeof window & { acceptanceAnnouncements?: string[] }).acceptanceAnnouncements!.push(text);
      }).observe(live, { childList: true, characterData: true, subtree: true });
      for (const [id, value] of [["activity", "architecture"], ["preference", "evening"], ["activity", "daylight-walk"]]) {
        const select = document.getElementById(id) as HTMLSelectElement;
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await expect(page.locator("#activity")).toHaveValue("daylight-walk");
    await expect(page.locator("#activity")).toBeFocused();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { acceptanceAnnouncements?: string[] }).acceptanceAnnouncements ?? [])).toHaveLength(1);
    const announcements = await page.evaluate(() => (window as typeof window & { acceptanceAnnouncements?: string[] }).acceptanceAnnouncements ?? []);
    expect(announcements[0]).not.toContain("fit fit");
  });

  test("rejected writes stay write-free; idempotency, caps, and cookie attributes hold", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "The write-boundary proof runs once; rendering coverage is cross-engine.");
    await openPortland(page);
    const valid = await saveFormValues(page);
    const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3010").origin;
    const headers = { Origin: origin, "Sec-Fetch-Site": "same-origin", Accept: "application/json" };
    const crossOrigin = await page.request.post("/api/plans", { form: valid, headers: { ...headers, Origin: "https://example.com", "Sec-Fetch-Site": "cross-site" } });
    expect(crossOrigin.status()).toBe(403);
    const honeypot = await page.request.post("/api/plans", { form: { ...valid, website: "filled" }, headers });
    expect(honeypot.status()).toBe(400);
    const invalid = await page.request.post("/api/plans", { form: { ...valid, activity: "unknown" }, headers });
    expect(invalid.status()).toBe(400);
    const oversize = await page.request.post("/api/plans", { form: { ...valid, unused: "x".repeat(33 * 1024) }, headers });
    expect(oversize.status()).toBe(413);

    const first = await page.request.post("/api/plans", { form: valid, headers });
    expect(first.status()).toBe(201);
    const firstBody = await first.json() as { shareUrl: string; deletionSecret: string; replay: boolean };
    const written = [{ shareUrl: firstBody.shareUrl, deletionSecret: firstBody.deletionSecret }];
    const setCookie = first.headers()["set-cookie"] ?? "";
    const browserCookie = setCookie.match(/ah_browser=([^;,]+)/)?.[1];
    expect(browserCookie).toBeTruthy();
    const browserHeaders = { ...headers, Cookie: `ah_browser=${browserCookie}` };
    const replay = await page.request.post("/api/plans", { form: valid, headers: browserHeaders });
    expect(replay.status()).toBe(201);
    const replayBody = await replay.json() as { shareUrl: string; replay: boolean };
    expect(replayBody.shareUrl).toBe(firstBody.shareUrl);
    expect(replayBody.replay).toBe(true);

    for (let index = 0; index < 2; index += 1) {
      const write = await page.request.post("/api/plans", { form: { ...valid, idempotencyKey: crypto.randomUUID() }, headers: browserHeaders });
      expect(write.status()).toBe(201);
      const writtenBody = await write.json() as { shareUrl: string; deletionSecret: string };
      written.push(writtenBody);
    }
    const capped = await page.request.post("/api/plans", { form: { ...valid, idempotencyKey: crypto.randomUUID() }, headers: browserHeaders });
    expect(capped.status()).toBe(429);

    const id = firstBody.shareUrl.split("/").pop()!;
    const authorityHeader = setCookie.split("\n").find((line) => line.startsWith(`ah_delete_${id}=`)) ?? "";
    expect(authorityHeader).toContain(`Path=/plans/${id}`);
    expect(authorityHeader).toMatch(/Max-Age=2592000/i);
    expect(authorityHeader).toMatch(/; HttpOnly; SameSite=lax/i);
    if (process.env.EXPECT_SECURE_COOKIE === "1") expect(authorityHeader).toContain("; Secure;");
    else expect(authorityHeader).not.toContain("; Secure;");
    await page.context().addCookies([{
      name: `ah_delete_${id}`,
      value: firstBody.deletionSecret,
      domain: new URL(origin).hostname,
      path: `/plans/${id}`,
      httpOnly: true,
      secure: origin.startsWith("https:"),
      sameSite: "Lax"
    }]);
    const crossSiteDocument = `<a href="${firstBody.shareUrl}">Open plan from another site</a>`;
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(crossSiteDocument)}`);
    await page.getByRole("link", { name: "Open plan from another site" }).click();
    await expect(page.getByRole("link", { name: "Delete this plan" })).toBeVisible();
    expect(await page.evaluate(() => document.cookie)).not.toContain(firstBody.deletionSecret);
    for (const item of written) {
      const writtenId = item.shareUrl.split("/").pop()!;
      const cleanup = await page.request.post(`/plans/${writtenId}/delete/action`, {
        headers: { ...headers, Cookie: `${deletionCookieNameForTest(writtenId)}=${item.deletionSecret}` },
        maxRedirects: 0
      });
      expect(cleanup.status()).toBe(303);
    }
  });

  test("the complete save success also works without JavaScript", async ({ browser, browserName }) => {
    test.skip(browserName !== "chromium", "The server-rendered write response is engine-independent.");
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await openPortland(page);
    const href = await page.getByRole("link", { name: "Review before saving" }).getAttribute("href");
    await page.goto(href!);
    await page.getByRole("button", { name: "Save plan and get link" }).click();
    await expect(page.locator("h1")).toHaveText("Keep both parts.");
    await expect(page.getByText("Deletion secret · shown once")).toBeVisible();
    await expect(page.locator(".masthead")).toContainText("Aperture Hours");
    await expect(page.locator("textarea")).toHaveCount(2);
    await expect(page.locator("footer")).toContainText("CC BY 4.0");
    await expect(page.locator("footer")).toContainText("not a guarantee");
    await expect(page.locator("footer")).toContainText("Open-Meteo");
    await expect(page.getByRole("link", { name: "Report a problem" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    expect(await page.locator("textarea").nth(0).evaluate((node) => node.scrollHeight - node.clientHeight)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: path.join(captureRoot, "chromium-nojs-save-success-390.png"), fullPage: true });
    const shareUrl = await page.locator("textarea").nth(0).inputValue();
    const deletionSecret = await page.locator("textarea").nth(1).inputValue();
    const id = shareUrl.split("/").pop()!;
    const cleanup = await context.request.post(`/plans/${id}/delete/action`, {
      headers: {
        Origin: new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3010").origin,
        "Sec-Fetch-Site": "same-origin",
        Cookie: `${deletionCookieNameForTest(id)}=${deletionSecret}`
      },
      maxRedirects: 0
    });
    expect(cleanup.status()).toBe(303);
    await context.close();
  });
});
