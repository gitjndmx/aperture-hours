import { NextRequest, NextResponse } from "next/server";
import { deletionCookieName } from "@/lib/cookies";
import { hashDeletionSecret } from "@/lib/crypto";
import { getPlanStore } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  let originMatches = false;
  try {
    if (origin) {
      const supplied = new URL(origin);
      const expectedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
      const expectedProtocol = `${request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")}:`;
      originMatches = supplied.host === expectedHost && supplied.protocol === expectedProtocol;
    }
  } catch {
    originMatches = false;
  }
  if (!originMatches || (fetchSite && fetchSite !== "same-origin") || !/^[A-Za-z0-9_-]{32}$/.test(id)) {
    return failure();
  }
  const secret = request.cookies.get(deletionCookieName(id))?.value;
  const store = getPlanStore();
  if (!secret || !store) return failure();
  const result = await store.delete(id, hashDeletionSecret(secret));
  if (result !== "deleted") return failure();
  const response = NextResponse.redirect(new URL(`/plans/${id}/deleted`, request.url), 303);
  response.cookies.set(deletionCookieName(id), "", { path: `/plans/${id}`, maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function failure() {
  return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Plan unchanged — Aperture Hours</title><link rel="stylesheet" href="/api-response.css"></head><body><main><p class="eyebrow">Nothing was changed</p><h1>The plan could not be deleted right now.</h1><p>The deletion authority was missing, expired, or did not match. The same response is used in every case. Try again in a moment or keep the plan; no plan details were disclosed.</p><p><a href="/">Return to Aperture Hours</a></p></main></body></html>`, { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
