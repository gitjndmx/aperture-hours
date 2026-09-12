import { boundedJson } from "./http";
import type { DayReading, ForecastBundle, HourReading, Place } from "./types";

type GeocodingResponse = {
  results?: Array<{
    id?: number;
    name?: string;
    admin1?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
    feature_code?: string;
  }>;
};

type ForecastResponse = {
  timezone?: string;
  timezone_abbreviation?: string;
  utc_offset_seconds?: number;
  hourly?: {
    time?: string[];
    cloud_cover?: Array<number | null>;
    direct_radiation?: Array<number | null>;
    diffuse_radiation?: Array<number | null>;
    visibility?: Array<number | null>;
    precipitation_probability?: Array<number | null>;
  };
  daily?: {
    time?: string[];
    sunrise?: Array<string | null>;
    sunset?: Array<string | null>;
    daylight_duration?: Array<number | null>;
    sunshine_duration?: Array<number | null>;
  };
};

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const normalized = query.trim().slice(0, 100);
  if (normalized.length < 2) return [];
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", normalized);
  url.searchParams.set("count", "8");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const data = await boundedJson<GeocodingResponse>(url, 256 * 1024, 86_400);
  return (data.results ?? []).flatMap((item) => {
    if (
      typeof item.id !== "number" ||
      typeof item.name !== "string" ||
      typeof item.country !== "string" ||
      typeof item.latitude !== "number" ||
      typeof item.longitude !== "number" ||
      typeof item.timezone !== "string"
    ) return [];
    return [{
      id: item.id,
      name: item.name,
      region: item.admin1 ?? "Region not returned",
      country: item.country,
      latitude: Number(item.latitude.toFixed(4)),
      longitude: Number(item.longitude.toFixed(4)),
      timezone: item.timezone
    }];
  });
}

export async function getForecast(place: Place): Promise<ForecastBundle> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(place.latitude));
  url.searchParams.set("longitude", String(place.longitude));
  url.searchParams.set("hourly", [
    "cloud_cover",
    "direct_radiation",
    "diffuse_radiation",
    "visibility",
    "precipitation_probability"
  ].join(","));
  url.searchParams.set("daily", "sunrise,sunset,daylight_duration,sunshine_duration");
  url.searchParams.set("timezone", place.timezone);
  url.searchParams.set("forecast_days", "7");

  const data = await boundedJson<ForecastResponse>(url, 1024 * 1024, 1_800);
  const hourly = data.hourly;
  const daily = data.daily;
  if (!hourly?.time || !daily?.time || daily.time.length !== 7) {
    throw new Error("Open-Meteo returned an incomplete forecast shape");
  }

  const hours: HourReading[] = hourly.time.map((time, index) => ({
    time,
    cloudCover: finite(hourly.cloud_cover?.[index]),
    directRadiation: finite(hourly.direct_radiation?.[index]),
    diffuseRadiation: finite(hourly.diffuse_radiation?.[index]),
    visibility: finite(hourly.visibility?.[index]),
    precipitationProbability: finite(hourly.precipitation_probability?.[index])
  }));

  const days: DayReading[] = daily.time.map((date, index) => ({
    date,
    sunrise: daily.sunrise?.[index] ?? null,
    sunset: daily.sunset?.[index] ?? null,
    daylightDuration: finite(daily.daylight_duration?.[index]),
    sunshineDuration: finite(daily.sunshine_duration?.[index]),
    hours: hours.filter((hour) => hour.time.startsWith(`${date}T`))
  }));

  if (days.some((day) => day.hours.length !== 24)) {
    throw new Error("Open-Meteo returned an incomplete hourly series");
  }

  return {
    place,
    timezoneAbbreviation: data.timezone_abbreviation ?? place.timezone,
    utcOffsetSeconds: data.utc_offset_seconds ?? 0,
    retrievedAt: new Date().toISOString(),
    days,
    source: "Open-Meteo"
  };
}

export function placeSlug(place: Place) {
  const words = `${place.name}-${place.region}-${place.country}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
  return `${words || "place"}-${place.id}`;
}

export function placeQuery(place: Place) {
  return new URLSearchParams({
    id: String(place.id),
    name: place.name,
    region: place.region,
    country: place.country,
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    timezone: place.timezone
  });
}
