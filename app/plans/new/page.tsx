import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { SaveForm } from "@/components/save-form";
import { activityLabels, preferenceLabels } from "@/lib/constants";
import { getForecast } from "@/lib/open-meteo";
import { controlsSchema, placeSchema } from "@/lib/schema";
import { savingAvailability } from "@/lib/store";

export const metadata: Metadata = { title: "Save this plan", description: "Review the public-link, retained-field, deletion, and expiry terms before saving a daylight plan.", alternates: { canonical: "/plans/new" }, robots: { index: false, follow: false } };

type Params = Record<string, string | string[] | undefined>;
function scalar(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }

export default async function NewPlan({ searchParams }: { searchParams: Promise<Params> }) {
  const values = await searchParams;
  const place = placeSchema.safeParse({
    id: scalar(values.id), name: scalar(values.name), region: scalar(values.region) ?? "Region not returned",
    country: scalar(values.country), latitude: scalar(values.latitude), longitude: scalar(values.longitude), timezone: scalar(values.timezone)
  });
  if (!place.success) return <section className="route-shell state-page"><p className="eyebrow">Nothing to save</p><h1>Choose a complete city first.</h1><p>No plan was stored.</p><Link className="primary-button" href="/">Search for a city</Link></section>;

  let forecast;
  try { forecast = await getForecast(place.data); }
  catch { return <section className="route-shell state-page"><p className="eyebrow">Live source unavailable</p><h1>The plan could not be checked.</h1><p>Nothing was saved because the current forecast could not be revalidated. Return to the reading and try again.</p><Link className="primary-button" href="/">Return to search</Link></section>; }
  const controls = controlsSchema.safeParse({ date: scalar(values.date), activity: scalar(values.activity), preference: scalar(values.preference) });
  if (!controls.success || !forecast.days.some((day) => day.date === controls.data.date)) {
    return <section className="route-shell state-page"><p className="eyebrow">Invalid plan</p><h1>The date or activity is not valid.</h1><p>Nothing was saved. Return to the reading and choose a date from the available seven-day forecast.</p><Link className="primary-button" href="/">Return to search</Link></section>;
  }
  const availability = savingAvailability();
  const fields = {
    schemaVersion: "1", id: String(place.data.id), name: place.data.name, region: place.data.region,
    country: place.data.country, latitude: String(place.data.latitude), longitude: String(place.data.longitude),
    timezone: place.data.timezone, date: controls.data.date, activity: controls.data.activity,
    preference: controls.data.preference, idempotencyKey: randomUUID()
  };

  return (
    <article className="route-shell save-page">
      <p className="eyebrow">{place.data.name} · {controls.data.date} · {activityLabels[controls.data.activity]} · {preferenceLabels[controls.data.preference]}</p>
      <h1>Save this plan.</h1>
      <p className="lede">The disclosures appear before the only storage action. Review what becomes public and what cannot be recovered.</p>
      <div className="disclosure-sequence">
        <section><p className="eyebrow">01 · Stored fields</p><h2>A closed, city-level record</h2><p>A saved plan keeps the city, region, and country you selected, the coarse coordinates the geocoding API returned, the date, activity, time preference, forecast snapshot as it reads now, the save time, schema version, and Open-Meteo attribution.</p></section>
        <section><p className="eyebrow">02 · Excluded</p><h2>No personal submission fields</h2><p>It does not accept your name, email, exact street address, uploads, or any text you write.</p></section>
        <section><p className="eyebrow">03 · Public link</p><h2>Treat the result as public</h2><p>Anyone who has the link can read the plan. The link is unguessable, but it is not private.</p></section>
        <section><p className="eyebrow">04 · Retention</p><h2>30-day lifetime</h2><p>After 30 days, the plan becomes unavailable and is removed by the next authenticated daily cleanup.</p></section>
        <section><p className="eyebrow">05 · Deletion authority</p><h2>One browser-held secret</h2><p>Deleting needs a one-time secret. It is shown once and kept only in this browser; the server stores only a hash. If you lose this browser or clear its storage, you cannot delete the plan yourself. The plan still becomes unavailable after 30 days.</p></section>
        <section><p className="eyebrow">06 · Availability</p><h2>Small public-write boundary</h2><p>Aperture Hours saves up to 20 plans a day across all visitors and 3 per browser per rolling hour. Those fixed launch limits bound storage operations. If storage is unavailable, saving stops while planning remains usable.</p></section>
      </div>
      <SaveForm fields={fields} enabled={availability.enabled} unavailableMessage={availability.reason === "command-stop" ? "The observed monthly command ceiling has been reached. Planning still works; nothing is being stored." : undefined} />
    </article>
  );
}
