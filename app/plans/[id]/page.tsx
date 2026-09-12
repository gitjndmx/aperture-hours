import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CopyLink } from "@/components/copy-link";
import { CurrentComparison, SnapshotView } from "@/components/snapshot-view";
import { activityLabels } from "@/lib/constants";
import { deletionCookieName } from "@/lib/cookies";
import { UpstreamError } from "@/lib/http";
import { getForecast } from "@/lib/open-meteo";
import { getPlanStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const readPlan = cache(async (id: string) => {
  if (!/^[A-Za-z0-9_-]{32}$/.test(id)) return { status: "missing" as const };
  const store = getPlanStore();
  if (!store) return { status: "unavailable" as const };
  try {
    const plan = await store.get(id);
    return plan ? { status: "found" as const, plan } : { status: "missing" as const };
  } catch {
    return { status: "unavailable" as const };
  }
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await readPlan(id);
  if (result.status === "missing") notFound();
  if (result.status === "unavailable") return { title: "Shared daylight plan unavailable", robots: { index: false, follow: false } };
  return { title: `${result.plan.place.name} daylight plan`, description: `A saved Aperture Hours daylight plan for ${result.plan.place.name} on ${result.plan.date}.`, alternates: { canonical: `/plans/${id}` }, robots: { index: false, follow: false } };
}

export default async function SharedPlan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ compare?: string }> }) {
  const { id } = await params;
  const { compare } = await searchParams;
  const result = await readPlan(id);
  if (result.status === "missing") notFound();
  if (result.status === "unavailable") return <section className="route-shell state-page"><p className="eyebrow">Storage unavailable</p><h1>This plan cannot be read right now.</h1><p>No substitute values are shown. Try the link again in a moment.</p><Link className="primary-button" href="/">Plan with live data</Link></section>;
  const plan = result.plan;
  const cookieStore = await cookies();
  const hasAuthority = Boolean(cookieStore.get(deletionCookieName(id))?.value);
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const shareUrl = `${protocol}://${host}/plans/${id}`;
  let current = null;
  let comparisonError: "timeout" | "oversize" | "upstream" | null = null;
  if (compare === "1") {
    try { current = await getForecast(plan.place); } catch (cause) { comparisonError = cause instanceof UpstreamError ? cause.kind : "upstream"; }
  } else if (compare === "error" && process.env.NODE_ENV !== "production" && process.env.ALLOW_TEST_FIXTURES === "1") {
    comparisonError = "upstream";
  }

  return (
    <article className="route-shell shared-page">
      <p className="eyebrow">Shared plan · Public to anyone holding this link</p>
      <h1>{plan.place.name},<br />{plan.place.region}</h1>
      <p className="lede">{plan.date} · {activityLabels[plan.activity]}. The saved forecast appears first and never changes.</p>
      <CopyLink url={shareUrl} />
      <SnapshotView plan={plan} />
      <section className="compare-action">
        <div><p className="eyebrow">Optional live comparison</p><h2>Read the source again.</h2><p>Opening a shared link makes no automatic Open-Meteo request. Ask for a current comparison only when you need it.</p></div>
        <form method="get"><input type="hidden" name="compare" value="1" /><button className="primary-button" type="submit">Compare current forecast</button></form>
      </section>
      {current && <CurrentComparison forecast={current} plan={plan} />}
      {comparisonError && <section className="comparison-block form-error" role="alert"><p className="eyebrow">Current forecast unavailable</p><h2>The saved snapshot is unchanged.</h2><p>{comparisonError === "timeout" ? "The current forecast request took too long and was stopped." : comparisonError === "oversize" ? "The current forecast response was larger than expected and was rejected." : "Open-Meteo did not return a usable current response."} No current values are shown. Try the comparison again in a moment.</p></section>}
      <section className="delete-entry">
        <p className="eyebrow">Deletion</p>
        {hasAuthority ? <><h2>This browser holds the deletion authority.</h2><p>The next page explains the permanent result before anything changes.</p><Link className="secondary-button" href={`/plans/${id}/delete`}>Delete this plan</Link></> : <><h2>Self-service deletion is unavailable here.</h2><p>This browser does not hold the deletion secret for this plan. The secret is shown once and kept only in the browser that created the plan — the server stores only a hash, so it cannot be recovered or re-sent. This plan becomes unavailable after 30 days and is removed by the next daily cleanup.</p></>}
      </section>
    </article>
  );
}
