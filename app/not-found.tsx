import Link from "next/link";

export default function NotFound() {
  return <section className="route-shell state-page"><p className="eyebrow">404 · No route</p><h1>That page does not exist.</h1><p>Try a city search from the home page.</p><Link className="primary-button" href="/">Search for a city</Link></section>;
}
