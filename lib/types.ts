export const activities = [
  "portraits",
  "interiors",
  "architecture",
  "location-scouting",
  "daylight-walk"
] as const;

export const preferences = ["none", "morning", "midday", "afternoon", "evening"] as const;

export type Activity = (typeof activities)[number];
export type TimePreference = (typeof preferences)[number];
export type FitTier = "Strong fit" | "Workable" | "Limited";
export type Provenance = "Forecast value" | "Calculated" | "Recommendation" | "Written by us";

export type Place = {
  id: number;
  name: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export type HourReading = {
  time: string;
  cloudCover: number | null;
  directRadiation: number | null;
  diffuseRadiation: number | null;
  visibility: number | null;
  precipitationProbability: number | null;
};

export type DayReading = {
  date: string;
  sunrise: string | null;
  sunset: string | null;
  daylightDuration: number | null;
  sunshineDuration: number | null;
  hours: HourReading[];
};

export type ForecastBundle = {
  place: Place;
  timezoneAbbreviation: string;
  utcOffsetSeconds: number;
  retrievedAt: string;
  days: DayReading[];
  source: "Open-Meteo";
};

export type CriterionResult = {
  label: string;
  status: "met" | "unmet" | "unavailable";
};

export type WindowReading = {
  key: string;
  start: string;
  end: string;
  tier: FitTier;
  criteria: CriterionResult[];
  hours: HourReading[];
  means: {
    cloudCover: number | null;
    directRadiation: number | null;
    diffuseRadiation: number | null;
    combinedRadiation: number | null;
    visibility: number | null;
    precipitationProbability: number | null;
  };
  preferenceDistance: number;
  usableRunLength: number;
};

export type SavedPlan = {
  schemaVersion: 1;
  id: string;
  place: Place;
  date: string;
  activity: Activity;
  preference: TimePreference;
  snapshot: ForecastBundle;
  createdAt: string;
  sourceAttribution: "Forecast data by Open-Meteo, CC BY 4.0.";
  deletionHash: string;
};

export type PublicSavedPlan = Omit<SavedPlan, "deletionHash">;
