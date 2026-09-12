import type { Metadata } from "next";
import Link from "next/link";
import { PendingPlaceLink } from "@/components/pending-place-link";
import { placeQuery, placeSlug, searchPlaces } from "@/lib/open-meteo";
import { UpstreamError } from "@/lib/http";
import type { Place } from "@/lib/types";

export const metadata: Metadata = { alternates: { canonical: "/" }, robots: { index: true, follow: true } };

function PlaceResult({ place }: { place: Place }) {
  const href = `/light/${placeSlug(place)}?${placeQuery(place)}`;
  return (
    <li>
      <PendingPlaceLink href={href}>
        <strong>{place.name}</strong>
        <span>{place.region}</span>
        <span>{place.country}</span>
        <span className="place-coordinate">{place.latitude.toFixed(2)}, {place.longitude.toFixed(2)}</span>
      </PendingPlaceLink>
    </li>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  let places: Place[] = [];
  let error: string | null = null;
  if (q.trim().length >= 2) {
    try {
      places = await searchPlaces(q);
    } catch (cause) {
      error = cause instanceof UpstreamError && cause.kind === "timeout"
        ? "The place search took too long and was stopped. No place was selected. Search again."
        : "Open-Meteo did not respond to the place search. No place was selected. Search again in a moment.";
    }
  }

  return (
    <>
      <section className="home-hero route-shell">
        <div className="hero-copy reveal">
          <p className="eyebrow">A daylight planning instrument</p>
          <h1>Read the<br />useful hours.</h1>
          <p className="lede">Compare every returned two-hour daylight window for a city, date, and activity. The leading window keeps its forecast evidence in view.</p>
        </div>
        <div className="hero-instrument reveal" aria-hidden="true">
          <div className="ambient-edge" />
          <div className="instrument-label"><span>DIRECT</span><span>DIFFUSE</span><span>CLOUD</span></div>
          <div className="instrument-time">06:00—20:00</div>
        </div>
      </section>

      <section className="search-section" aria-labelledby="search-heading">
        <div className="search-grid">
          <div>
            <p className="eyebrow">Start with place</p>
            <h2 id="search-heading">Choose the city deliberately.</h2>
          </div>
          <form action="/" method="get" className="search-form">
            <div className="field">
              <label htmlFor="city-search">City</label>
              <input id="city-search" name="q" type="search" minLength={2} maxLength={100} required defaultValue={q} placeholder="Portland" autoComplete="off" />
            </div>
            <button className="primary-button" type="submit">Search cities</button>
          </form>
        </div>

        {error && <div className="state-message form-error" role="alert"><h3>Place search unavailable</h3><p>{error}</p></div>}
        {q && !error && places.length === 0 && (
          <div className="state-message" role="status">
            <h3>No matching city was returned</h3>
            <p>Try a larger nearby city or check the spelling. Nothing was selected.</p>
          </div>
        )}
        {places.length > 0 && (
          <div className="results-block">
            <p className="result-count">{places.length} {places.length === 1 ? "place" : "places"} returned for “{q}”. Region and country stay visible so names are not silently guessed.</p>
            <ol className="place-results">{places.map((place) => <PlaceResult key={place.id} place={place} />)}</ol>
          </div>
        )}
      </section>

      <section className="home-method">
        <p className="eyebrow">What the result means</p>
        <div className="home-method-grid">
          <h2>No hidden score.</h2>
          <div className="reading-copy">
            <p>Returned cloud cover, direct and diffuse radiation, visibility, and precipitation chance are tested against published activity preferences. Every candidate remains available to inspect.</p>
            <p>Buildings, terrain, local obstruction, smoke, indoor window direction, and facade orientation are not modeled. This is an authored planning heuristic—not a scientific finding, confidence figure, or safety guidance.</p>
            <Link href="/method">Read the method</Link>
          </div>
        </div>
      </section>
    </>
  );
}
