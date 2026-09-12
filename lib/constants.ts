import type { Activity, TimePreference } from "./types";

export const CONTACT_URL = "https://github.com/gitjndmx/aperture-hours/issues";
export const OPEN_METEO_ATTRIBUTION = "Forecast data by Open-Meteo, CC BY 4.0." as const;
export const PLAN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const MAX_PLAN_BYTES = 32 * 1024;
export const GLOBAL_DAILY_CAP = 20;
export const BROWSER_HOURLY_CAP = 3;
export const COMMAND_STOP = 400_000;

export const activityLabels: Record<Activity, string> = {
  portraits: "Portraits",
  interiors: "Interiors",
  architecture: "Architecture",
  "location-scouting": "Location scouting",
  "daylight-walk": "Daylight walk"
};

export const preferenceLabels: Record<TimePreference, string> = {
  none: "No preference",
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening"
};

export const activityDescriptions: Record<Activity, string> = {
  portraits: "Prefers soft light: mean diffuse radiation at least 80 W/m², mean direct radiation no more than 350 W/m², precipitation chance no more than 30%, and visibility at least 5 km.",
  interiors: "Prefers bright ambient light indoors: mean combined radiation at least 200 W/m², diffuse radiation at least 60 W/m², and precipitation chance no more than 50%. Window direction and glazing are not modeled.",
  architecture: "Prefers modeling light on facades: mean direct radiation at least 250 W/m², cloud cover no more than 65%, visibility at least 8 km, and precipitation chance no more than 35%. Facade orientation and obstruction are not modeled.",
  "location-scouting": "Needs daylight; prefers visibility at least 5 km and precipitation chance no more than 50%, and favors the longest unbroken usable run.",
  "daylight-walk": "Needs daylight; prefers precipitation chance no more than 35%, visibility at least 3 km, and combined radiation at least 50 W/m²."
};
