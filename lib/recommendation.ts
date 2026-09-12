import type {
  Activity,
  CriterionResult,
  DayReading,
  FitTier,
  HourReading,
  TimePreference,
  WindowReading
} from "./types";

type MeanKey = "cloudCover" | "directRadiation" | "diffuseRadiation" | "visibility" | "precipitationProbability";

const preferredHours: Record<TimePreference, number> = {
  none: 12,
  morning: 8,
  midday: 12,
  afternoon: 15,
  evening: 18
};

function mean(hours: HourReading[], key: MeanKey) {
  const values = hours.map((hour) => hour[key]).filter((value): value is number => value !== null);
  return values.length === hours.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function test(label: string, value: number | null, predicate: (value: number) => boolean): CriterionResult {
  if (value === null) return { label, status: "unavailable" };
  return { label, status: predicate(value) ? "met" : "unmet" };
}

function criteriaFor(activity: Activity, values: WindowReading["means"]): CriterionResult[] {
  switch (activity) {
    case "portraits":
      return [
        test("Diffuse radiation at least 80 W/m²", values.diffuseRadiation, (v) => v >= 80),
        test("Direct radiation no more than 350 W/m²", values.directRadiation, (v) => v <= 350),
        test("Precipitation chance no more than 30%", values.precipitationProbability, (v) => v <= 30),
        test("Visibility at least 5 km", values.visibility, (v) => v >= 5_000)
      ];
    case "interiors":
      return [
        test("Combined radiation at least 200 W/m²", values.combinedRadiation, (v) => v >= 200),
        test("Diffuse radiation at least 60 W/m²", values.diffuseRadiation, (v) => v >= 60),
        test("Precipitation chance no more than 50%", values.precipitationProbability, (v) => v <= 50)
      ];
    case "architecture":
      return [
        test("Direct radiation at least 250 W/m²", values.directRadiation, (v) => v >= 250),
        test("Cloud cover no more than 65%", values.cloudCover, (v) => v <= 65),
        test("Visibility at least 8 km", values.visibility, (v) => v >= 8_000),
        test("Precipitation chance no more than 35%", values.precipitationProbability, (v) => v <= 35)
      ];
    case "location-scouting":
      return [
        test("Visibility at least 5 km", values.visibility, (v) => v >= 5_000),
        test("Precipitation chance no more than 50%", values.precipitationProbability, (v) => v <= 50)
      ];
    case "daylight-walk":
      return [
        test("Precipitation chance no more than 35%", values.precipitationProbability, (v) => v <= 35),
        test("Visibility at least 3 km", values.visibility, (v) => v >= 3_000),
        test("Combined radiation at least 50 W/m²", values.combinedRadiation, (v) => v >= 50)
      ];
  }
}

function tierFor(criteria: CriterionResult[]): FitTier {
  if (criteria.some((criterion) => criterion.status === "unavailable")) return "Limited";
  const met = criteria.filter((criterion) => criterion.status === "met").length;
  if (met === criteria.length) return "Strong fit";
  return met >= Math.ceil(criteria.length / 2) ? "Workable" : "Limited";
}

function hourNumber(time: string) {
  return Number(time.slice(11, 13));
}

function isDaylightWindow(day: DayReading, first: HourReading, second: HourReading) {
  if (!day.sunrise || !day.sunset) return false;
  const windowStart = new Date(first.time).getTime();
  const windowEnd = new Date(second.time).getTime() + 60 * 60 * 1000;
  const sunrise = new Date(day.sunrise).getTime();
  const sunset = new Date(day.sunset).getTime();
  return Number.isFinite(sunrise) && Number.isFinite(sunset) && windowStart >= sunrise && windowEnd <= sunset;
}

function rawWindows(day: DayReading, activity: Activity, preference: TimePreference): WindowReading[] {
  const readings: WindowReading[] = [];
  for (let index = 0; index < day.hours.length - 1; index += 1) {
    const pair = [day.hours[index], day.hours[index + 1]];
    if (!isDaylightWindow(day, pair[0], pair[1])) continue;
    const directRadiation = mean(pair, "directRadiation");
    const diffuseRadiation = mean(pair, "diffuseRadiation");
    const means = {
      cloudCover: mean(pair, "cloudCover"),
      directRadiation,
      diffuseRadiation,
      combinedRadiation: directRadiation === null || diffuseRadiation === null ? null : directRadiation + diffuseRadiation,
      visibility: mean(pair, "visibility"),
      precipitationProbability: mean(pair, "precipitationProbability")
    };
    const criteria = criteriaFor(activity, means);
    const startHour = hourNumber(pair[0].time);
    readings.push({
      key: `${day.date}-${pair[0].time}`,
      start: pair[0].time,
      end: `${day.date}T${String((startHour + 2) % 24).padStart(2, "0")}:00`,
      tier: tierFor(criteria),
      criteria,
      hours: pair,
      means,
      preferenceDistance: preference === "none" ? 0 : Math.abs(startHour + 1 - preferredHours[preference]),
      usableRunLength: 1
    });
  }
  return readings;
}

function applyScoutingRuns(windows: WindowReading[]) {
  let index = 0;
  while (index < windows.length) {
    if (windows[index].tier === "Limited") {
      index += 1;
      continue;
    }
    let end = index;
    while (end + 1 < windows.length && windows[end + 1].tier !== "Limited") end += 1;
    const length = end - index + 1;
    for (let cursor = index; cursor <= end; cursor += 1) windows[cursor].usableRunLength = length;
    index = end + 1;
  }
}

const tierOrder: Record<FitTier, number> = { "Strong fit": 0, Workable: 1, Limited: 2 };

export function recommendWindows(day: DayReading, activity: Activity, preference: TimePreference) {
  const windows = rawWindows(day, activity, preference);
  if (activity === "location-scouting") applyScoutingRuns(windows);
  return windows.sort((left, right) => {
    const tier = tierOrder[left.tier] - tierOrder[right.tier];
    if (tier) return tier;
    if (activity === "location-scouting" && left.usableRunLength !== right.usableRunLength) {
      return right.usableRunLength - left.usableRunLength;
    }
    const preferenceRank = left.preferenceDistance - right.preferenceDistance;
    if (preferenceRank) return preferenceRank;
    const leftRain = left.means.precipitationProbability ?? Number.POSITIVE_INFINITY;
    const rightRain = right.means.precipitationProbability ?? Number.POSITIVE_INFINITY;
    return leftRain - rightRain || left.start.localeCompare(right.start);
  });
}

export function leadTime(date: string, availableDates: string[]) {
  const days = Math.max(0, availableDates.indexOf(date));
  if (days <= 2) return "Near-term (0–2 days)";
  if (days <= 4) return "Mid-range (3–4 days)";
  return "Later forecast (5–6 days)";
}

export function formatClock(iso: string) {
  const [hour, minute] = iso.slice(11, 16).split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:${String(minute).padStart(2, "0")} ${period}`;
}

export function formatOffset(seconds: number) {
  const sign = seconds < 0 ? "−" : "+";
  const absolute = Math.abs(seconds);
  return `UTC${sign}${String(Math.floor(absolute / 3600)).padStart(2, "0")}:${String(Math.floor((absolute % 3600) / 60)).padStart(2, "0")}`;
}
