import { chromium } from "@playwright/test";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const action = process.argv[2];
const baseURL = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3010");
const authorityFile = path.resolve(".audit-plan.json");

if (action === "create") {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(new URL("/?q=Portland", baseURL).toString());
    await page.locator(".place-result").filter({ hasText: "Oregon" }).first().click();
    await page.locator(".winner-row").waitFor();
    const reviewPath = await page.getByRole("link", { name: "Review before saving" }).getAttribute("href");
    if (!reviewPath) throw new Error("The save review link was unavailable.");
    await page.goto(new URL(reviewPath, baseURL).toString());
    await page.getByRole("button", { name: "Save plan and get link" }).click();
    await page.locator(".save-success").waitFor();
    const shareUrl = await page.locator(".secret-output input").inputValue();
    const deletionSecret = await page.locator(".secret-output textarea").inputValue();
    await writeFile(authorityFile, `${JSON.stringify({ baseURL: baseURL.origin, shareUrl, deletionSecret }, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ status: "created", shareUrl }));
  } finally {
    await browser.close();
  }
} else if (action === "cleanup") {
  const record = JSON.parse(await readFile(authorityFile, "utf8"));
  const id = new URL(record.shareUrl).pathname.split("/").pop();
  const response = await fetch(new URL(`/plans/${id}/delete/action`, record.baseURL), {
    method: "POST",
    redirect: "manual",
    headers: {
      Origin: record.baseURL,
      "Sec-Fetch-Site": "same-origin",
      Cookie: `ah_delete_${id}=${record.deletionSecret}`
    }
  });
  if (response.status !== 303) throw new Error(`Audit-plan cleanup returned ${response.status}.`);
  await unlink(authorityFile);
  console.log(JSON.stringify({ status: "deleted", id }));
} else {
  throw new Error("Use: node scripts/audit-plan.mjs create|cleanup");
}
