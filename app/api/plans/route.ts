import { NextRequest, NextResponse } from "next/server";
import { MAX_PLAN_BYTES, OPEN_METEO_ATTRIBUTION, PLAN_TTL_SECONDS } from "@/lib/constants";
import { baseCookieOptions, browserCookieName, deletionCookieName } from "@/lib/cookies";
import { deriveDeletionSecret, hashDeletionSecret, randomBrowserKey, randomShareId, signBrowserKey, verifyBrowserKey } from "@/lib/crypto";
import { getForecast, searchPlaces } from "@/lib/open-meteo";
import { controlsSchema, placeSchema } from "@/lib/schema";
import { getPlanStore, savingAvailability } from "@/lib/store";
import type { SavedPlan } from "@/lib/types";

export const runtime = "nodejs";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

function messageFor(reason: string) {
  if (reason === "global-cap") return "No more plans can be saved today. Planning still works; come back after 00:00 UTC.";
  if (reason === "browser-cap") return "This browser has saved 3 plans in the last hour. Planning still works.";
  if (reason === "command-stop") return "Saving has stopped at the observed monthly command ceiling. Planning still works; nothing was stored.";
  return "Saving is temporarily unavailable while the storage boundary is being verified. Everything else still works; nothing was stored.";
}

function documentShell(title: string, content: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} — Aperture Hours</title><link rel="stylesheet" href="/api-response.css"></head><body><header class="masthead"><a class="wordmark" href="/">AH · Aperture Hours</a><nav aria-label="Primary"><a href="/method">Method</a><a href="/privacy">Privacy</a></nav></header><main>${content}</main><footer><p>Forecast data by <a href="https://open-meteo.com/" rel="license">Open-Meteo</a>, CC BY 4.0. Saved plans are public to anyone holding the link and become unavailable after 30 days.</p><p>Model output is not a guarantee, an exact-site measurement, or safety advice.</p><p><a href="https://github.com/gitjndmx/aperture-hours/issues">Report a problem</a> · No account is required.</p></footer></body></html>`;
}

async function readBoundedBody(request: NextRequest): Promise<ArrayBuffer | null> {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PLAN_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(Uint8Array.from(value));
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

function responseFor(request: NextRequest, status: number, payload: Record<string, unknown>, browserCookie?: string) {
  const wantsJson = request.headers.get("accept")?.includes("application/json");
  let response: NextResponse;
  if (wantsJson) {
    response = NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
  } else if (status >= 400) {
    const error = escapeHtml(String(payload.error ?? "Nothing was saved."));
    response = new NextResponse(documentShell("Plan not saved", `<p class="eyebrow">Plan not saved</p><h1>Nothing was stored.</h1><p>${error}</p><p><a class="button" href="/">Return to city search</a></p>`), { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } else {
    const shareUrl = escapeHtml(String(payload.shareUrl));
    const secret = escapeHtml(String(payload.deletionSecret));
    response = new NextResponse(documentShell("Plan saved", `<p class="eyebrow">Plan saved</p><h1>Keep both parts.</h1><p>Anyone with the share link can read this plan. The deletion secret is shown once in this response and is also held in this browser. It cannot be recovered or re-sent.</p><label>Share link<textarea readonly rows="3">${shareUrl}</textarea></label><label>Deletion secret · shown once<textarea readonly rows="3">${secret}</textarea></label><p><a class="button" href="${shareUrl}">Open saved plan</a></p>`), { status: 201, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (browserCookie) response.cookies.set(browserCookieName, browserCookie, { ...baseCookieOptions, path: "/", maxAge: 3_600 });
  return response;
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin) return false;
  try {
    const supplied = new URL(origin);
    const expectedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const expectedProtocol = `${request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")}:`;
    return supplied.host === expectedHost && supplied.protocol === expectedProtocol && (!fetchSite || fetchSite === "same-origin");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return responseFor(request, 403, { error: "The save request did not come from this site. Nothing was saved." });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_PLAN_BYTES) return responseFor(request, 413, { error: "The save submission was larger than 32 KB and was rejected. Nothing was saved." });
  const body = await readBoundedBody(request);
  if (!body) return responseFor(request, 413, { error: "The save submission was larger than 32 KB and was rejected. Nothing was saved." });
  const form = await new Request(request.url, { method: "POST", headers: request.headers, body }).formData();
  if (String(form.get("website") ?? "")) {
    console.warn("Aperture Hours rejected a filled save honeypot.");
    return responseFor(request, 400, { error: "The submission was rejected. Nothing was saved." });
  }

  const placeCandidate = placeSchema.safeParse({
    id: form.get("id"), name: form.get("name"), region: form.get("region"), country: form.get("country"),
    latitude: form.get("latitude"), longitude: form.get("longitude"), timezone: form.get("timezone")
  });
  const controls = controlsSchema.safeParse({ date: form.get("date"), activity: form.get("activity"), preference: form.get("preference") });
  const idempotencyKey = String(form.get("idempotencyKey") ?? "");
  if (!placeCandidate.success || !controls.success || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(idempotencyKey) || form.get("schemaVersion") !== "1") {
    return responseFor(request, 400, { error: "The city, date, activity, preference, schema version, or idempotency key is not valid. Nothing was saved." });
  }

  const availability = savingAvailability();
  if (!availability.enabled) return responseFor(request, 503, { error: messageFor(availability.reason) });
  const store = getPlanStore();
  if (!store) return responseFor(request, 503, { error: messageFor("storage-unavailable") });

  try {
    const matches = await searchPlaces(placeCandidate.data.name);
    const officialPlace = matches.find((place) => place.id === placeCandidate.data.id);
    if (!officialPlace) return responseFor(request, 400, { error: "The selected city could not be revalidated as a city-level Open-Meteo result. Nothing was saved." });
    const forecast = await getForecast(officialPlace);
    const day = forecast.days.find((item) => item.date === controls.data.date);
    if (!day) return responseFor(request, 400, { error: "The forecast date is outside today through six days ahead in the selected place. Nothing was saved." });

    let browserKey = verifyBrowserKey(request.cookies.get(browserCookieName)?.value);
    if (!browserKey) browserKey = randomBrowserKey();
    const signedBrowserKey = signBrowserKey(browserKey);
    const deletionSecret = deriveDeletionSecret(browserKey, idempotencyKey);
    let result;
    let record: SavedPlan | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      record = {
        schemaVersion: 1,
        id: randomShareId(),
        place: officialPlace,
        date: controls.data.date,
        activity: controls.data.activity,
        preference: controls.data.preference,
        snapshot: { ...forecast, days: [day] },
        createdAt: new Date().toISOString(),
        sourceAttribution: OPEN_METEO_ATTRIBUTION,
        deletionHash: hashDeletionSecret(deletionSecret)
      };
      if (Buffer.byteLength(JSON.stringify(record)) > MAX_PLAN_BYTES) {
        return responseFor(request, 413, { error: "The validated plan record was larger than 32 KB and was rejected. Nothing was saved." }, signedBrowserKey);
      }
      result = await store.create(record, browserKey, idempotencyKey);
      if (result.ok || result.reason !== "collision") break;
    }
    if (!result || !record) return responseFor(request, 503, { error: messageFor("unavailable") }, signedBrowserKey);
    if (!result.ok) {
      const status = result.reason === "global-cap" || result.reason === "browser-cap" ? 429 : 503;
      return responseFor(request, status, { error: messageFor(result.reason) }, signedBrowserKey);
    }

    const id = result.id;
    const shareUrl = new URL(`/plans/${id}`, request.headers.get("origin")!).toString();
    const response = responseFor(request, 201, { shareUrl, deletionSecret, replay: result.replay }, signedBrowserKey);
    response.cookies.set(deletionCookieName(id), deletionSecret, { ...baseCookieOptions, path: `/plans/${id}`, maxAge: PLAN_TTL_SECONDS });
    return response;
  } catch (error) {
    console.error("Aperture Hours save revalidation failed", error instanceof Error ? error.message : "Unknown error");
    return responseFor(request, 503, { error: "The live city or forecast source could not be revalidated. Nothing was saved. Try again in a moment." });
  }
}
