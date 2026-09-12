import Link from "next/link";

export const metadata = { title: "Plan deleted" };

export default function DeletedPlan() {
  return <section className="route-shell state-page"><p className="eyebrow">Deletion complete</p><h1>Plan deleted.</h1><p>The link no longer works. The plan cannot be restored.</p><Link className="primary-button" href="/">Plan another daylight window</Link></section>;
}
