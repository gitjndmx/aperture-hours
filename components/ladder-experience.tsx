"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DataValue } from "./data-value";
import { activities, preferences, type Activity, type FitTier, type ForecastBundle, type TimePreference, type WindowReading } from "@/lib/types";
import { activityDescriptions, activityLabels, preferenceLabels } from "@/lib/constants";
import { formatClock, formatOffset, leadTime, recommendWindows } from "@/lib/recommendation";

type StartState = { date: string; activity: Activity; preference: TimePreference };

function runTransition(update: () => void) {
  const documentWithTransition = document as Document & { startViewTransition?: (callback: () => void) => void };
  if (document.documentElement.classList.contains("motion-on") && documentWithTransition.startViewTransition) {
    documentWithTransition.startViewTransition(update);
  } else update();
}

function validState(url: URL, fallback: StartState, dates: string[]): StartState {
  const date = url.searchParams.get("date") ?? fallback.date;
  const activity = url.searchParams.get("activity") as Activity | null;
  const preference = url.searchParams.get("preference") as TimePreference | null;
  return {
    date: dates.includes(date) ? date : fallback.date,
    activity: activity && activities.includes(activity) ? activity : fallback.activity,
    preference: preference && preferences.includes(preference) ? preference : fallback.preference
  };
}

function writeUrl(state: StartState) {
  const url = new URL(window.location.href);
  url.searchParams.set("date", state.date);
  url.searchParams.set("activity", state.activity);
  url.searchParams.set("preference", state.preference);
  window.history.pushState(state, "", url);
}

function stripStyle(window: WindowReading): React.CSSProperties {
  const direct = Math.min(100, Math.max(0, (window.means.directRadiation ?? 0) / 7));
  const diffuse = Math.min(100, Math.max(0, (window.means.diffuseRadiation ?? 0) / 3));
  const cloud = Math.min(100, Math.max(0, window.means.cloudCover ?? 0));
  return {
    "--direct": `${direct}%`,
    "--diffuse": `${diffuse}%`,
    "--cloud": `${cloud}%`
  } as React.CSSProperties;
}

type NowMarker = { position: number; label: string; advancing: boolean };

function WindowStrip({ window, marker, compact = false }: { window: WindowReading; marker?: NowMarker; compact?: boolean }) {
  const cloud = window.means.cloudCover;
  return (
    <div className="window-strip" style={stripStyle(window)} role="img" aria-label={`Code-authored daylight strip. Mean cloud cover ${cloud === null ? "not returned" : `${Math.round(cloud)} percent`}.`}>
      {marker && (
        <>
        <span
          className="now-marker"
          style={{ "--now": `${marker.position}%` } as React.CSSProperties}
          aria-hidden="true"
        />
        <span
          className="now-label"
          data-edge={marker.position > 70 ? "right" : "left"}
          style={{ "--now": `${marker.position}%` } as React.CSSProperties}
          aria-hidden="true"
        >{compact ? marker.label.split(" ")[0] : marker.label}{marker.advancing ? " · live" : compact ? " · static" : " · static, not advancing"}</span>
        </>
      )}
      <span className="strip-text">Cloud {cloud === null ? "not returned" : `${Math.round(cloud)}%`}</span>
    </div>
  );
}

function CriterionList({ window }: { window: WindowReading }) {
  const unavailable = window.criteria.filter((item) => item.status === "unavailable");
  return (
    <div className="criterion-wrap">
      <ul className="criteria-list">
        {window.criteria.map((criterion) => (
          <li key={criterion.label} data-status={criterion.status}>
            <span>{criterion.status === "met" ? "Met" : criterion.status === "unmet" ? "Not met" : "Unavailable test"}</span>
            {criterion.label}
          </li>
        ))}
      </ul>
      {unavailable.length > 0 && (
        <p className="unavailable-test">Some tests could not run: {unavailable.map((item) => item.label).join(", ")}. This window stays Limited; the tier cannot be lowered further, and missing values were not treated as zero.</p>
      )}
    </div>
  );
}

function MiniMeans({ window }: { window: WindowReading }) {
  return (
    <dl className="mini-means">
      <div><dt>Direct</dt><dd><DataValue value={window.means.directRadiation === null ? "Not returned" : `${Math.round(window.means.directRadiation)} W/m²`} provenance="Calculated" /></dd></div>
      <div><dt>Diffuse</dt><dd><DataValue value={window.means.diffuseRadiation === null ? "Not returned" : `${Math.round(window.means.diffuseRadiation)} W/m²`} provenance="Calculated" /></dd></div>
      <div><dt>Cloud</dt><dd><DataValue value={window.means.cloudCover === null ? "Not returned" : `${Math.round(window.means.cloudCover)}%`} provenance="Calculated" /></dd></div>
      <div><dt>Rain</dt><dd><DataValue value={window.means.precipitationProbability === null ? "Not returned" : `${Math.round(window.means.precipitationProbability)}%`} provenance="Calculated" /></dd></div>
    </dl>
  );
}

function rowReason(window: WindowReading) {
  const unavailable = window.criteria.filter((item) => item.status === "unavailable").map((item) => item.label);
  if (unavailable.length) return `Unavailable: ${unavailable.join("; ")}`;
  const unmet = window.criteria.filter((item) => item.status === "unmet").map((item) => item.label);
  if (unmet.length) return `Misses: ${unmet.join("; ")}`;
  return "Placed by the stated tie-break order";
}

function WindowRow({ window, winner, marker }: { window: WindowReading; winner?: boolean; marker?: NowMarker }) {
  const viewName = `window-${window.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const title = `${formatClock(window.start)}–${formatClock(window.end)}`;
  if (winner) {
    return (
      <article className="winner-row" style={{ viewTransitionName: viewName }}>
        <div className="winner-heading">
          <div><p className="eyebrow">Best window · <DataValue value={window.tier} provenance="Recommendation" /></p><h2 aria-label={title}><span aria-hidden="true" className="clock-part">{formatClock(window.start)}</span><span aria-hidden="true" className="clock-part">–{formatClock(window.end)}</span></h2></div>
          <WindowStrip window={window} marker={marker} />
        </div>
        <MiniMeans window={window} />
        <CriterionList window={window} />
      </article>
    );
  }
  return (
    <details className="window-row" style={{ viewTransitionName: viewName }}>
      <summary>
        <span className="row-time">{title}</span>
        <span className="row-tier">{window.tier}</span>
        <span className="row-reason">{rowReason(window)}</span>
        <WindowStrip window={window} marker={marker} compact />
      </summary>
      <div className="row-details">
        <MiniMeans window={window} />
        <CriterionList window={window} />
      </div>
    </details>
  );
}

function HourlyEvidence({ forecast, date, winner }: { forecast: ForecastBundle; date: string; winner?: WindowReading }) {
  const day = forecast.days.find((candidate) => candidate.date === date)!;
  const inWinner = (time: string) => winner?.hours.some((hour) => hour.time === time) ?? false;
  return (
    <section className="evidence-section" aria-labelledby="evidence-title">
      <div className="section-heading"><p className="eyebrow">Forecast evidence</p><h2 id="evidence-title">The hours behind this</h2></div>
      <details className="evidence-disclosure">
        <summary>Read the 24 returned hours</summary>
      <div className="evidence-table-wrap">
        <table className="evidence-table">
          <thead><tr><th>Hour</th><th>Cloud cover</th><th>Direct radiation</th><th>Diffuse radiation</th><th>Visibility</th><th>Precipitation chance</th></tr></thead>
          <tbody>
            {day.hours.map((hour) => (
              <tr key={hour.time} data-recommended={inWinner(hour.time) || undefined}>
                <th scope="row">{formatClock(hour.time)}{inWinner(hour.time) && <span className="recommended-label">In recommended window</span>}</th>
                <td data-label="Cloud cover"><DataValue value={hour.cloudCover === null ? "Not returned" : `${Math.round(hour.cloudCover)}%`} provenance="Forecast value" /></td>
                <td data-label="Direct radiation"><DataValue value={hour.directRadiation === null ? "Not returned" : `${Math.round(hour.directRadiation)} W/m²`} provenance="Forecast value" /></td>
                <td data-label="Diffuse radiation"><DataValue value={hour.diffuseRadiation === null ? "Not returned" : `${Math.round(hour.diffuseRadiation)} W/m²`} provenance="Forecast value" /></td>
                <td data-label="Visibility"><DataValue value={hour.visibility === null ? "Not returned" : `${(hour.visibility / 1000).toFixed(1)} km`} provenance={hour.visibility === null ? "Forecast value" : "Calculated"} description={hour.visibility === null ? "Visibility not returned" : `Visibility converted from ${Math.round(hour.visibility)} metres to ${(hour.visibility / 1000).toFixed(1)} kilometres`} /></td>
                <td data-label="Precipitation chance"><DataValue value={hour.precipitationProbability === null ? "Not returned" : `${Math.round(hour.precipitationProbability)}%`} provenance="Forecast value" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </details>
    </section>
  );
}

export function LadderExperience({ forecast, initial }: { forecast: ForecastBundle; initial: StartState }) {
  const dates = useMemo(() => forecast.days.map((day) => day.date), [forecast.days]);
  const [state, setState] = useState(initial);
  const announcement = useRef<HTMLParagraphElement>(null);
  const announcementVersion = useRef(0);
  const day = forecast.days.find((candidate) => candidate.date === state.date) ?? forecast.days[0];
  const windows = useMemo(() => recommendWindows(day, state.activity, state.preference), [day, state.activity, state.preference]);
  const winner = windows[0];
  const currentLead = leadTime(state.date, dates);
  const [clock, setClock] = useState(() => new Date(forecast.retrievedAt).getTime());
  const [motionEnabled, setMotionEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const readMotion = () => setMotionEnabled(!root.classList.contains("motion-off"));
    queueMicrotask(readMotion);
    const observer = new MutationObserver(readMotion);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!motionEnabled) return;
    const sync = () => {
      if (document.visibilityState === "visible") setClock(Date.now());
    };
    queueMicrotask(sync);
    const timer = window.setInterval(sync, 60_000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [motionEnabled]);

  const marker = useMemo<NowMarker | undefined>(() => {
    if (!winner || !day.sunrise || !day.sunset) return undefined;
    const localParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: forecast.place.timezone,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date(clock));
    const part = (type: Intl.DateTimeFormatPartTypes) => localParts.find((item) => item.type === type)?.value ?? "";
    const localDate = `${part("year")}-${part("month")}-${part("day")}`;
    if (localDate !== state.date) return undefined;
    const minutes = Number(part("hour")) * 60 + Number(part("minute"));
    const minutesOf = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
    const sunrise = minutesOf(day.sunrise);
    const sunset = minutesOf(day.sunset);
    if (!Number.isFinite(minutes) || sunset <= sunrise || minutes < sunrise || minutes > sunset) return undefined;
    const position = ((minutes - sunrise) / (sunset - sunrise)) * 100;
    return {
      position,
      label: `${part("hour")}:${part("minute")} ${forecast.timezoneAbbreviation} (${formatOffset(forecast.utcOffsetSeconds)})`,
      advancing: motionEnabled === true
    };
  }, [clock, day.sunrise, day.sunset, forecast.place.timezone, forecast.timezoneAbbreviation, forecast.utcOffsetSeconds, motionEnabled, state.date, winner]);

  const sortLegend = useMemo(() => {
    const parts = ["fit first"];
    if (state.activity === "location-scouting") parts.push("then the longer adjacent usable run");
    if (state.preference !== "none") parts.push("then the requested time of day");
    parts.push("then lower precipitation chance", "then the earlier window");
    return parts.join(", ");
  }, [state.activity, state.preference]);

  useEffect(() => {
    const onPopState = () => setState(validState(new URL(window.location.href), initial, dates));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [dates, initial]);

  function update(next: StartState, initiatingControl: HTMLElement) {
    const version = ++announcementVersion.current;
    const active = initiatingControl;
    const nextDay = forecast.days.find((candidate) => candidate.date === next.date) ?? forecast.days[0];
    const nextWindows = recommendWindows(nextDay, next.activity, next.preference);
    const nextWinner = nextWindows[0];
    const nextLead = leadTime(next.date, dates);
    document.querySelectorAll<HTMLDetailsElement>(".ladder details[open]").forEach((details) => {
      if (details.contains(document.activeElement)) details.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
      details.open = false;
    });
    runTransition(() => setState(next));
    writeUrl(next);
    queueMicrotask(() => {
      if (version !== announcementVersion.current) return;
      active.focus({ preventScroll: true });
      if (announcement.current) {
        announcement.current.textContent = nextWinner
          ? `${nextWindows.length} daylight windows updated. Best window ${formatClock(nextWinner.start)} to ${formatClock(nextWinner.end)}, ${nextWinner.tier}, ${nextLead}.`
          : "No qualifying daylight window is available for this date.";
      }
    });
  }

  const shared = new URLSearchParams({
    id: String(forecast.place.id), name: forecast.place.name, region: forecast.place.region,
    country: forecast.place.country, latitude: String(forecast.place.latitude), longitude: String(forecast.place.longitude),
    timezone: forecast.place.timezone, date: state.date, activity: state.activity, preference: state.preference
  });

  return (
    <>
      <section className="light-intro">
        <p className="eyebrow">{forecast.place.region} · {forecast.place.country}</p>
        <h1>{forecast.place.name}</h1>
        <p className="lede">Every returned two-hour daylight window stays in the comparison. The leading window expands into the tests that placed it there.</p>
      </section>

      <section className="controls-section" aria-labelledby="controls-title">
        <h2 className="sr-only" id="controls-title">Reading controls</h2>
        <form method="get" className="reading-controls">
          {Object.entries({ id: forecast.place.id, name: forecast.place.name, region: forecast.place.region, country: forecast.place.country, latitude: forecast.place.latitude, longitude: forecast.place.longitude, timezone: forecast.place.timezone }).map(([name, value]) => <input key={name} type="hidden" name={name} value={String(value)} />)}
          <div className="field"><label htmlFor="date">Forecast date</label><select id="date" name="date" value={state.date} onChange={(event) => update({ ...state, date: event.currentTarget.value }, event.currentTarget)}>{forecast.days.map((item) => <option key={item.date} value={item.date}>{new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${item.date}T12:00:00Z`))}</option>)}</select></div>
          <div className="field"><label htmlFor="activity">Activity</label><select id="activity" name="activity" value={state.activity} onChange={(event) => update({ ...state, activity: event.currentTarget.value as Activity }, event.currentTarget)}>{activities.map((value) => <option key={value} value={value}>{activityLabels[value]}</option>)}</select></div>
          <div className="field"><label htmlFor="preference">Time preference</label><select id="preference" name="preference" value={state.preference} onChange={(event) => update({ ...state, preference: event.currentTarget.value as TimePreference }, event.currentTarget)}>{preferences.map((value) => <option key={value} value={value}>{preferenceLabels[value]}</option>)}</select></div>
          <button className="secondary-button apply-button" type="submit">Apply reading</button>
        </form>
        <details className="activity-criteria">
          <summary>What each activity prefers</summary>
          <div className="criteria-copy">{activities.map((value) => <div key={value}><h3>{activityLabels[value]}</h3><p>{activityDescriptions[value]}</p></div>)}</div>
        </details>
      </section>

      <section className="dayline" aria-label="Selected day's returned sunlight figures">
        <div><span>Sunrise</span><DataValue value={day.sunrise ? formatClock(day.sunrise) : "Not returned"} provenance="Forecast value" /></div>
        <div><span>Sunset</span><DataValue value={day.sunset ? formatClock(day.sunset) : "Not returned"} provenance="Forecast value" /></div>
        <div><span>Daylight</span><DataValue value={day.daylightDuration === null ? "Not returned" : `${Math.floor(day.daylightDuration / 3600)} h ${Math.round((day.daylightDuration % 3600) / 60)} min`} provenance="Forecast value" /></div>
        <div><span>Lead time</span><DataValue value={currentLead} provenance="Written by us" /></div>
      </section>

      <section className="ladder-section" aria-labelledby="ladder-title">
        <p ref={announcement} className="sr-only" aria-live="polite" aria-atomic="true" />
        <div className="ladder-heading"><div><p className="eyebrow">Window ladder</p><h2 id="ladder-title">{activityLabels[state.activity]} · {preferenceLabels[state.preference]}</h2></div><p><span>Strong fit</span> every preferred condition · <span>Workable</span> daylight and at least half · <span>Limited</span> fewer than half or an unavailable required test</p></div>
        {!winner ? (
          <div className="no-window-state">
            <h3>No qualifying daylight window is available for this date.</h3>
            <p>There are not two consecutive returned daylight hours to compare. Try another date or place.</p>
            <Link href="/">Choose another place</Link>
          </div>
        ) : (
          <div className="ladder">
            <WindowRow window={winner} winner marker={marker} />
            <p className="sort-legend"><strong>Order:</strong> {sortLegend}.</p>
            {windows.slice(1).map((window, index) => {
              const previousTier: FitTier = index === 0 ? winner.tier : windows[index].tier;
              return (
                <div className="runner-rung" key={window.key}>
                  {window.tier !== previousTier && <p className="tier-group-label">{window.tier}</p>}
                  <WindowRow window={window} marker={marker} />
                </div>
              );
            })}
          </div>
        )}
        <div className="save-rung">
          <div><p className="eyebrow">Keep this reading</p><p>A separate step explains the public link, retained fields, one-time deletion authority, limits, and 30-day expiry before anything is stored.</p></div>
          <Link className="primary-button" href={`/plans/new?${shared}`}>Review before saving</Link>
        </div>
      </section>

      <HourlyEvidence forecast={forecast} date={state.date} winner={winner} />
      <section className="forecast-notes">
        <p className="source-note">Forecast retrieved {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(forecast.retrievedAt))} UTC · {forecast.timezoneAbbreviation} ({formatOffset(forecast.utcOffsetSeconds)}) · IANA timezone {forecast.place.timezone} · Open-Meteo best-match model · hourly radiation values are averages over the hour.</p>
        <p className="source-note">Forecasts change. Later dates change more. Check again closer to the day. Buildings, terrain, local obstruction, smoke, and microclimate are not modeled.</p>
        <p className="source-note">Forecast data by <a href="https://open-meteo.com/">Open-Meteo</a>, CC BY 4.0. <Link href="/method">Read the complete method and limitations.</Link></p>
      </section>
    </>
  );
}
