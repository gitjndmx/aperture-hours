import type { Metadata } from "next";
import Link from "next/link";
import { LadderExperience } from "@/components/ladder-experience";
import { UpstreamError } from "@/lib/http";
import { getForecast } from "@/lib/open-meteo";
import { controlsSchema, placeSchema } from "@/lib/schema";
import { polarNightForecast } from "@/lib/test-fixtures";

type Params = Record<string, string | string[] | undefined>;
function scalar(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }

export async function generateMetadata({ params, searchParams }: { params: Promise<{ place: string }>; searchParams: Promise<Params> }): Promise<Metadata> {
  const { place } = await params;
  const values = await searchParams;
  const canonicalQuery = new URLSearchParams();
  for (const key of ["id", "name", "region", "country", "latitude", "longitude", "timezone"]) {
    const value = scalar(values[key]);
    if (value) canonicalQuery.set(key, value);
  }
  const suffix = canonicalQuery.size ? `?${canonicalQuery}` : "";
  return {
    title: "Daylight reading",
    description: "Inspect every returned two-hour daylight window and the forecast evidence behind the recommendation.",
    alternates: { canonical: `/light/${place}${suffix}` },
    robots: { index: true, follow: true }
  };
}

export default async function LightPage({ searchParams }: { params: Promise<{ place: string }>; searchParams: Promise<Params> }) {
  const values = await searchParams;
  const parsedPlace = placeSchema.safeParse({
    id: scalar(values.id), name: scalar(values.name), region: scalar(values.region) ?? "Region not returned",
    country: scalar(values.country), latitude: scalar(values.latitude), longitude: scalar(values.longitude), timezone: scalar(values.timezone)
  });
  if (!parsedPlace.success) {
    return <section className="route-shell state-page"><p className="eyebrow">Invalid place</p><h1>This city selection is incomplete.</h1><p>No forecast was requested. Return to search and choose one complete result.</p><Link className="primary-button" href="/">Search for a city</Link></section>;
  }

  let forecast;
  try {
    if (process.env.NODE_ENV !== "production" && process.env.ALLOW_TEST_FIXTURES === "1" && scalar(values.fixture) === "polar-night") {
      forecast = polarNightForecast(parsedPlace.data);
    } else {
      forecast = await getForecast(parsedPlace.data);
    }
  } catch (cause) {
    const kind = cause instanceof UpstreamError ? cause.kind : "upstream";
    const title = kind === "timeout" ? "The request took too long and was stopped." : kind === "oversize" ? "The forecast response was larger than expected and was rejected." : "Open-Meteo did not respond in time.";
    return <section className="route-shell state-page"><p className="eyebrow">Live source unavailable</p><h1>{title}</h1><p>No values are shown because a complete response was not received. We do not fill gaps with estimates.</p><Link className="primary-button" href="/">Choose a city again</Link></section>;
  }
  const fallback = { date: forecast.days[0].date, activity: "portraits" as const, preference: "none" as const };
  const parsedControls = controlsSchema.safeParse({
    date: scalar(values.date) ?? fallback.date,
    activity: scalar(values.activity) ?? fallback.activity,
    preference: scalar(values.preference) ?? fallback.preference
  });
  const initial = parsedControls.success && forecast.days.some((day) => day.date === parsedControls.data.date) ? parsedControls.data : fallback;
  return <div className="route-shell light-shell"><LadderExperience forecast={forecast} initial={initial} /></div>;
}
