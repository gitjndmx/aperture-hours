import { NextResponse } from "next/server";
import { savingAvailability } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ status: "ok", saving: savingAvailability().enabled }, { headers: { "Cache-Control": "no-store" } });
}
