import type { Metadata } from "next";
import { CONTACT_URL } from "@/lib/constants";

export const metadata: Metadata = { title: "What this service stores", description: "The fields, public-link behavior, cookies, processors, deletion limits, retention, and contact route for Aperture Hours.", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <article className="route-shell document-page">
      <p className="eyebrow">Privacy · Actual launch architecture</p>
      <h1>What this service stores.</h1>
      <p className="lede">Searching and reading a live forecast creates no saved plan. The fields and browser state below apply only when you choose “Save plan and get link.”</p>
      <nav className="section-nav" aria-label="Privacy sections"><a href="#contains">Saved fields</a><a href="#never">Never accepted</a><a href="#browser-key">Browser key</a><a href="#public">Public links</a><a href="#deletion">Deletion</a><a href="#retention">Retention</a><a href="#processors">Processors</a><a href="#contact">Contact</a></nav>

      <section id="contains"><p className="eyebrow">01</p><h2>What a saved plan contains</h2><p>The city, region, and country you selected; coarse coordinates returned by the geocoding API; the forecast date; activity; time preference; the selected-date forecast snapshot; creation time; schema version; source attribution; and a cryptographic hash of the deletion secret.</p></section>
      <section id="never"><p className="eyebrow">02</p><h2>What we never accept or store</h2><p>The service has no fields for a name, email address, exact street address, upload, or free-form text. It does not use an IP address as identity, request precise device location, or add visitor analytics or tracking.</p></section>
      <section id="browser-key"><p className="eyebrow">03</p><h2>The browser key</h2><p>A random, tamper-evident value in an HttpOnly, SameSite=Lax cookie enforces the limit of three saves per browser in a rolling hour. It is not an identity, is not linked to a person, and expires with that rate-limit window.</p></section>
      <section id="public"><p className="eyebrow">04</p><h2>Public links</h2><p>Anyone holding a plan link can read its city-level contents. The 192-bit link identifier is unguessable, but the plan is not private. Do not save a plan if sharing those fields would be a concern.</p></section>
      <section id="deletion"><p className="eyebrow">05</p><h2>Deletion</h2><p>The one-time deletion secret is shown once and held in a Secure, HttpOnly, SameSite=Lax cookie scoped to that plan in the creating browser. The server stores only its hash. If the browser-held secret is lost or its site data is cleared, self-service deletion is not possible and the secret cannot be recovered or re-sent.</p></section>
      <section id="retention"><p className="eyebrow">06</p><h2>Retention</h2><p>Each plan records its creation time. An authenticated daily cleanup removes private plan objects after their 30-day lifetime, so removal can occur at the next daily cleanup rather than at the exact anniversary second. Deleting with the creating browser&apos;s authority removes the plan immediately. An unavailable plan cannot be distinguished as expired, deleted, or never created through its public response.</p></section>
      <section id="processors"><p className="eyebrow">07</p><h2>Processors</h2><dl className="definition-rows"><div><dt>Vercel</dt><dd>Hosting, serverless functions, and private Blob plan storage</dd></div><div><dt>Open-Meteo</dt><dd>Forecast and geocoding requests made by the server</dd></div></dl></section>
      <section id="contact"><p className="eyebrow">08</p><h2>Contact through a public issue</h2><p><a href={CONTACT_URL}>Open the Aperture Hours GitHub Issues page</a>. Submitting requires a GitHub account and creates a public thread. Do not post personal data, deletion secrets, storage credentials, or private links. This limitation is part of the launch contact channel.</p></section>
    </article>
  );
}
