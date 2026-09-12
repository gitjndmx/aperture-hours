import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "How the daylight reading works", description: "The exact forecast variables, two-hour transformations, activity criteria, tie-breaks, source, and limitations behind Aperture Hours.", alternates: { canonical: "/method" } };

export default function MethodPage() {
  return (
    <article className="route-shell document-page">
      <p className="eyebrow">Method · Authored planning heuristic</p>
      <h1>How Aperture Hours reads the light.</h1>
      <p className="lede">The site applies fixed, visible tests to model output. It does not measure your exact site and does not calculate a confidence score.</p>
      <nav className="section-nav" aria-label="Method sections"><a href="#request">What we request</a><a href="#transform">How we transform it</a><a href="#lead-time">Lead time</a><a href="#limits">What we do not model</a><a href="#statement">What kind of statement this is</a><a href="#source">Attribution and terms</a><a href="#storage">Storage</a></nav>

      <section id="request"><p className="eyebrow">01</p><h2>What we request</h2><p>For the selected city, Aperture Hours requests exactly seven forecast days from Open-Meteo. Hourly fields are cloud cover, direct solar radiation, diffuse solar radiation, visibility, and precipitation probability. Daily fields are sunrise, sunset, daylight duration, and sunshine duration.</p><p>Every returned number remains labeled as a forecast value. Metres converted to kilometres, two-hour means, radiation sums, and durations assembled for display are labeled as calculated.</p></section>

      <section id="transform"><p className="eyebrow">02</p><h2>How we transform it</h2><p>Consecutive two-hour windows that fall inside the returned daylight period are tested against the chosen activity. Strong fit means every preferred condition is met. Workable means it is daylight and at least half are met. Limited means fewer than half are met.</p><p>If any required test cannot run, the presented fit is Limited. The missing tests are named, their raw cells read “Not returned,” and missing values are never treated as zero.</p><div className="method-rules"><section><h3>Portraits</h3><p>Mean diffuse radiation ≥80 W/m²; direct radiation ≤350 W/m²; precipitation chance ≤30%; visibility ≥5 km.</p></section><section><h3>Interiors</h3><p>Mean combined radiation ≥200 W/m²; diffuse radiation ≥60 W/m²; precipitation chance ≤50%.</p></section><section><h3>Architecture</h3><p>Mean direct radiation ≥250 W/m²; cloud cover ≤65%; visibility ≥8 km; precipitation chance ≤35%.</p></section><section><h3>Location scouting</h3><p>Visibility ≥5 km and precipitation chance ≤50%; the longest adjacent usable run is favored.</p></section><section><h3>Daylight walk</h3><p>Precipitation chance ≤35%; visibility ≥3 km; combined radiation ≥50 W/m².</p></section></div><p>When windows tie, location scouting first prefers the longer adjacent usable run; then, when a time of day is requested, the window nearest it; then lower precipitation probability; then the earlier window. Every candidate window remains available to inspect; no rank number or hidden score is exposed.</p></section>

      <section id="lead-time"><p className="eyebrow">03</p><h2>Lead time describes distance, not accuracy</h2><dl className="definition-rows"><div><dt>Near-term</dt><dd>0–2 days</dd></div><div><dt>Mid-range</dt><dd>3–4 days</dd></div><div><dt>Later forecast</dt><dd>5–6 days</dd></div></dl><p>Forecasts change, and later dates often change more. The label is not a confidence value. Check again closer to the day.</p></section>

      <section id="limits"><p className="eyebrow">04</p><h2>What we do not model</h2><p>The reading does not model buildings, terrain, local obstruction, smoke or other aerosol events, indoor window orientation or glazing, facade orientation, or microclimate. Open-Meteo model values cover an area; they are not a measurement at your exact position.</p></section>

      <section id="statement"><p className="eyebrow">05</p><h2>What kind of statement this is</h2><p>Activity thresholds and the recommendation order are written by Aperture Hours. They are transparent planning heuristics applied to returned model output—not scientific findings, guarantees, professional advice, safety guidance, or quantified confidence.</p></section>

      <section id="source"><p className="eyebrow">06</p><h2>Attribution and terms</h2><p>Forecast and geocoding data come from <a href="https://open-meteo.com/">Open-Meteo</a> and are attributed under CC BY 4.0. The launch is noncommercial, ad-free, and subscription-free and uses the Free/Open-Access endpoints. Commercial or promotional use, a need for guaranteed capacity, or usage beyond the free terms requires a separate Open-Meteo service decision before that change ships.</p></section>

      <section id="storage"><p className="eyebrow">07</p><h2>Storage</h2><p>Each saved plan is an immutable JSON record in a private Vercel Blob store. A small concurrency-controlled index enforces the launch write limits and one-hour replay behavior. An authenticated daily cleanup removes plan objects after their 30-day lifetime; an authorized deletion removes one immediately. Saving stops at the public-write boundary or when storage is unavailable, while live planning remains usable.</p><Link href="/privacy">Read the stored field list and deletion limits</Link></section>
    </article>
  );
}
