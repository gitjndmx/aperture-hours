import type { ForecastBundle, Place } from "./types";

export function polarNightForecast(place: Place): ForecastBundle {
  const start = new Date();
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  return {
    place,
    timezoneAbbreviation: "UTC",
    utcOffsetSeconds: 0,
    retrievedAt: new Date().toISOString(),
    source: "Open-Meteo",
    days: dates.map((date) => ({
      date,
      sunrise: null,
      sunset: null,
      daylightDuration: 0,
      sunshineDuration: 0,
      hours: Array.from({ length: 24 }, (_, hour) => ({
        time: `${date}T${String(hour).padStart(2, "0")}:00`,
        cloudCover: 100,
        directRadiation: 0,
        diffuseRadiation: 0,
        visibility: 10_000,
        precipitationProbability: 0
      }))
    }))
  };
}
