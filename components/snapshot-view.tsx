import { DataValue } from "./data-value";
import { activityLabels, preferenceLabels } from "@/lib/constants";
import { formatClock, recommendWindows } from "@/lib/recommendation";
import type { ForecastBundle, SavedPlan } from "@/lib/types";

function show(value: number | null, suffix = "") { return value === null ? "Not returned" : `${Math.round(value)}${suffix}`; }

export function SnapshotView({ plan, label = "Saved snapshot" }: { plan: SavedPlan; label?: string }) {
  const day = plan.snapshot.days.find((candidate) => candidate.date === plan.date) ?? plan.snapshot.days[0];
  const windows = recommendWindows(day, plan.activity, plan.preference);
  const winner = windows[0];
  return (
    <section className="snapshot-block" aria-labelledby="snapshot-title">
      <p className="eyebrow">{label} · Forecast as it read on {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(plan.snapshot.retrievedAt))} UTC</p>
      <div className="snapshot-heading">
        <div><h2 id="snapshot-title">{activityLabels[plan.activity]}</h2><p>{preferenceLabels[plan.preference]} · {plan.snapshot.timezoneAbbreviation}</p></div>
        {winner ? <div><p className="eyebrow">Best saved window · <DataValue value={winner.tier} provenance="Recommendation" /></p><strong>{formatClock(winner.start)}–{formatClock(winner.end)}</strong></div> : <p>No qualifying daylight window was present in this saved snapshot.</p>}
      </div>
      {winner && <><div className="snapshot-window-header" aria-hidden="true"><span>Window</span><span>Fit</span><span>Tests</span></div><ol className="snapshot-windows">{windows.map((window) => <li key={window.key}><span>{formatClock(window.start)}–{formatClock(window.end)}</span><span>{window.tier}</span><span>{window.criteria.some((item) => item.status === "met") ? `Met: ${window.criteria.filter((item) => item.status === "met").map((item) => item.label).join(" · ")}` : "No preferred condition met"}</span></li>)}</ol></>}
      <details className="snapshot-evidence">
        <summary>Read the saved hourly evidence</summary>
        <div className="snapshot-hour-grid">
          {day.hours.map((hour) => <article key={hour.time}><h3>{formatClock(hour.time)}</h3><dl><div><dt>Cloud cover</dt><dd><DataValue value={show(hour.cloudCover, "%")} provenance="Forecast value" /></dd></div><div><dt>Direct radiation</dt><dd><DataValue value={show(hour.directRadiation, " W/m²")} provenance="Forecast value" /></dd></div><div><dt>Diffuse radiation</dt><dd><DataValue value={show(hour.diffuseRadiation, " W/m²")} provenance="Forecast value" /></dd></div><div><dt>Visibility</dt><dd><DataValue value={hour.visibility === null ? "Not returned" : `${(hour.visibility / 1000).toFixed(1)} km`} provenance={hour.visibility === null ? "Forecast value" : "Calculated"} /></dd></div><div><dt>Precipitation chance</dt><dd><DataValue value={show(hour.precipitationProbability, "%")} provenance="Forecast value" /></dd></div></dl></article>)}
        </div>
      </details>
      <p className="source-note">{plan.sourceAttribution} Forecasts change. This saved snapshot is immutable and is not an exact-site measurement.</p>
    </section>
  );
}

export function CurrentComparison({ forecast, plan }: { forecast: ForecastBundle; plan: SavedPlan }) {
  const day = forecast.days.find((candidate) => candidate.date === plan.date);
  if (!day) return <section className="comparison-block"><p className="eyebrow">Current forecast</p><h2>This date is outside the current forecast.</h2><p>Only the saved snapshot is shown. No current value was substituted.</p></section>;
  const windows = recommendWindows(day, plan.activity, plan.preference);
  const winner = windows[0];
  return <section className="comparison-block"><p className="eyebrow">Current forecast · Retrieved just now</p><h2>{winner ? `${formatClock(winner.start)}–${formatClock(winner.end)} · ${winner.tier}` : "No qualifying daylight window"}</h2><p>The forecast has been read again. The saved snapshot remains exactly as it was; this current reading is shown separately and no numeric confidence or change score is calculated.</p><p className="source-note">Forecast retrieved {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(forecast.retrievedAt))} UTC · Forecast data by Open-Meteo, CC BY 4.0.</p></section>;
}
