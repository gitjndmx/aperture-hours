"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="route-shell state-page"><p className="eyebrow">Application error</p><h1>Something failed on our side.</h1><p>Nothing was saved or changed. Try loading this route again.</p><button className="primary-button" onClick={reset}>Load this route again</button></section>;
}
