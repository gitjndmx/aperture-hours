"use client";

import { useEffect, useRef, useState } from "react";

type Fields = Record<string, string>;
type Success = { shareUrl: string; deletionSecret: string; replay: boolean };

export function SaveForm({ fields, enabled, unavailableMessage }: { fields: Fields; enabled: boolean; unavailableMessage?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);
  const successRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (success) successRef.current?.focus({ preventScroll: true });
  }, [success]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/plans", {
        method: "POST",
        body: new FormData(event.currentTarget),
        headers: { Accept: "application/json" }
      });
      const data = await response.json() as Success & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Nothing was saved. Try again.");
      setSuccess(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something failed on our side. Nothing was saved. Try again.");
    } finally {
      setPending(false);
    }
  }

  const announcement = success ? "Plan saved. The share link and one-time deletion secret are ready." : pending ? "Saving plan…" : error ?? "";
  return (
    <>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
      {success ? <section ref={successRef} className="save-success" tabIndex={-1}>
        <p className="eyebrow">Plan saved{success.replay ? " · original result restored" : ""}</p>
        <h2>Keep both parts.</h2>
        <p>Anyone with the share link can read this plan. The deletion secret is shown once in this response and is also held in this browser. It cannot be recovered or re-sent.</p>
        <label className="secret-output"><span>Share link</span><input readOnly value={success.shareUrl} onFocus={(event) => event.currentTarget.select()} /></label>
        <label className="secret-output"><span>Deletion secret · shown once</span><textarea readOnly value={success.deletionSecret} onFocus={(event) => event.currentTarget.select()} rows={3} /></label>
        <a className="primary-button" href={success.shareUrl}>Open saved plan</a>
      </section> : <form action="/api/plans" method="post" onSubmit={submit} className="save-action">
      {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <div className="honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      {!enabled && <div className="state-message" role="status"><h3>Saving is temporarily unavailable</h3><p>{unavailableMessage ?? "The storage boundary is not ready. Everything on this page still works; nothing is being stored."}</p></div>}
      {error && <div className="state-message form-error" role="alert"><h3>Plan not saved</h3><p>{error}</p></div>}
      <button className="primary-button" type="submit" disabled={!enabled} aria-disabled={!enabled || pending}>{pending ? "Saving plan…" : "Save plan and get link"}</button>
    </form>}
    </>
  );
}
