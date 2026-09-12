import { chromium } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3010";
const phase = process.env.AUDIT_PHASE ?? "candidate";
const route = "/light/portland-oregon-united-states-5746545?id=5746545&name=Portland&region=Oregon&country=United+States&latitude=45.5235&longitude=-122.6762&timezone=America%2FLos_Angeles";
const reportDir = path.resolve(`../reports/${phase}`);
const captureDir = path.resolve(`../captures/${phase}`);
await mkdir(reportDir, { recursive: true });
await mkdir(captureDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const motion = [];
let pageMetrics;

for (const dpr of [1, 2]) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: dpr });
  if (dpr === 1) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
  await page.locator(".winner-row").waitFor();
  const metrics = await page.evaluate(async () => {
    const shifts = [];
    const longTasks = [];
    const shiftObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const item = entry;
        if (!item.hadRecentInput) shifts.push(item.value);
      }
    });
    const longObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    try { shiftObserver.observe({ type: "layout-shift", buffered: true }); } catch {}
    try { longObserver.observe({ type: "longtask", buffered: true }); } catch {}

    const intervals = [];
    const started = performance.now();
    let previous = started;
    const sample = new Promise((resolve) => {
      function frame(now) {
        intervals.push(now - previous);
        previous = now;
        if (now - started < 800) requestAnimationFrame(frame);
        else resolve(undefined);
      }
      requestAnimationFrame(frame);
    });
    for (const [id, value] of [["activity", "architecture"], ["preference", "evening"], ["activity", "daylight-walk"]]) {
      const select = document.getElementById(id);
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await sample;
    shiftObserver.disconnect();
    longObserver.disconnect();
    intervals.sort((a, b) => a - b);
    const p95 = intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * .95))] ?? 0;
    return {
      frameSamples: intervals.length,
      p95FrameIntervalMs: p95,
      maximumFrameIntervalMs: intervals.at(-1) ?? 0,
      longTasksOver50Ms: longTasks.filter((duration) => duration > 50),
      cls: shifts.reduce((sum, value) => sum + value, 0),
      finalActivity: document.getElementById("activity").value,
      finalPreference: document.getElementById("preference").value,
      activeElementId: document.activeElement?.id ?? null
    };
  });
  motion.push({ dpr, ...metrics });

  if (dpr === 1) {
    pageMetrics = await page.evaluate(() => {
      const resources = performance.getEntriesByType("resource").map((entry) => {
        const item = entry;
        return { name: item.name, type: item.initiatorType, transferSize: item.transferSize, encodedBodySize: item.encodedBodySize, decodedBodySize: item.decodedBodySize };
      });
      const scripts = resources.filter((item) => item.type === "script" || item.name.includes("/_next/static/chunks/"));
      return {
        domElements: document.querySelectorAll("*").length,
        ladderRows: document.querySelectorAll(".winner-row, .window-row").length,
        hourlyRows: document.querySelectorAll(".evidence-table tbody tr").length,
        initialScriptEncodedBytes: scripts.reduce((sum, item) => sum + item.encodedBodySize, 0),
        initialScriptDecodedBytes: scripts.reduce((sum, item) => sum + item.decodedBodySize, 0),
        resources
      };
    });
    await context.tracing.stop({ path: path.join(captureDir, "chromium-rapid-motion-trace.zip") });
  }
  await context.close();
}
await browser.close();

const response = await fetch(`${baseURL}${route}`, { headers: { "Accept-Encoding": "identity", "User-Agent": "Aperture-Hours-Audit/1.0" } });
const html = await response.text();
const icon = await readFile(path.resolve("app/icon.svg"));
const report = {
  phase,
  measuredAt: new Date().toISOString(),
  route,
  budgets: {
    domElementsMaximum: 2500,
    noJsHtmlGzipMaximumBytes: 120000,
    initialJsEncodedMaximumBytes: 180000,
    codeVisualAssetsMaximumBytes: 25000,
    longTasksOver50MsMaximum: 0,
    p95FrameIntervalMaximumMs: 20,
    maximumFrameIntervalMaximumMs: 34,
    clsMaximum: 0.05
  },
  page: {
    ...pageMetrics,
    noJsHtmlDecodedBytes: Buffer.byteLength(html),
    noJsHtmlGzipBytes: gzipSync(html).byteLength,
    codeVisualAssetBytes: icon.byteLength
  },
  motion,
  verdict: motion.every((item) => item.longTasksOver50Ms.length === 0 && item.p95FrameIntervalMs <= 20 && item.maximumFrameIntervalMs <= 34 && item.cls <= .05)
    && pageMetrics.domElements < 2500
    && gzipSync(html).byteLength < 120000
    && pageMetrics.initialScriptEncodedBytes < 180000
    && icon.byteLength < 25000 ? "pass" : "fail"
};
await writeFile(path.join(reportDir, "performance-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
