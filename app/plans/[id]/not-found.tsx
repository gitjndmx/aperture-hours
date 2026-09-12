import Link from "next/link";

export default function PlanNotFound() {
  return <section className="route-shell state-page"><p className="eyebrow">Unavailable plan</p><h1>This plan is not available.</h1><p>It may have expired after its 30 days, been deleted by the person who made it, or never existed. Links are not recoverable.</p><Link className="primary-button" href="/">Plan with live data</Link></section>;
}
