import { z } from "zod";
import { activities, preferences } from "./types";

export const placeSchema = z.object({
  id: z.coerce.number().int().nonnegative(),
  name: z.string().trim().min(1).max(120),
  region: z.string().trim().max(120),
  country: z.string().trim().min(1).max(120),
  latitude: z.coerce.number().finite().min(-90).max(90),
  longitude: z.coerce.number().finite().min(-180).max(180),
  timezone: z.string().trim().min(1).max(120).regex(/^[A-Za-z_+\-/]+$/)
}).strict();

export const controlsSchema = z.object({
  date: z.string().date(),
  activity: z.enum(activities),
  preference: z.enum(preferences)
});

export const saveInputSchema = z.object({
  schemaVersion: z.literal(1),
  place: placeSchema,
  date: z.string().date(),
  activity: z.enum(activities),
  preference: z.enum(preferences),
  snapshot: z.unknown(),
  idempotencyKey: z.string().uuid(),
  website: z.string().max(0).optional().default("")
}).strict();

export function validateForecastHorizon(date: string, availableDates: string[]) {
  return availableDates.includes(date);
}

const nullableFinite = z.number().finite().nullable();
const hourSchema = z.object({
  time: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  cloudCover: nullableFinite,
  directRadiation: nullableFinite,
  diffuseRadiation: nullableFinite,
  visibility: nullableFinite,
  precipitationProbability: nullableFinite
}).strict();

const daySchema = z.object({
  date: z.string().date(),
  sunrise: z.string().nullable(),
  sunset: z.string().nullable(),
  daylightDuration: nullableFinite,
  sunshineDuration: nullableFinite,
  hours: z.array(hourSchema).length(24)
}).strict();

export const forecastBundleSchema = z.object({
  place: placeSchema,
  timezoneAbbreviation: z.string().min(1).max(32),
  utcOffsetSeconds: z.number().int().min(-50_400).max(50_400),
  retrievedAt: z.string().datetime(),
  days: z.array(daySchema).min(1).max(7),
  source: z.literal("Open-Meteo")
}).strict();

export const savedPlanSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
  place: placeSchema,
  date: z.string().date(),
  activity: z.enum(activities),
  preference: z.enum(preferences),
  snapshot: forecastBundleSchema,
  createdAt: z.string().datetime(),
  sourceAttribution: z.literal("Forecast data by Open-Meteo, CC BY 4.0."),
  deletionHash: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();
