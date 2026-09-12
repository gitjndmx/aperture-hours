import Link from "next/link";
import { CONTACT_URL } from "@/lib/constants";
import { MotionControl } from "./motion-control";

export function SiteHeader() {
  return (
    <header className="site-header">
      <MotionControl />
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="header-line">
        <Link href="/" className="wordmark" aria-label="AH — Aperture Hours home">
          <span aria-hidden="true" className="wordmark-mark">AH</span>
          <span>Aperture Hours</span>
        </Link>
        <nav aria-label="Primary">
          <Link href="/method">Method</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>Forecast data by <a href="https://open-meteo.com/" rel="license">Open-Meteo</a>, CC BY 4.0.</p>
      <p>Saved plans become unavailable after 30 days. Model output is not a guarantee, an exact-site measurement, or safety advice.</p>
      <p><a href={CONTACT_URL}>Contact through public GitHub Issues</a>. A GitHub account is required; do not post personal data.</p>
    </footer>
  );
}
