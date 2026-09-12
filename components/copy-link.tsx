"use client";

import { useState } from "react";

export function CopyLink({ url }: { url: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "unavailable">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("unavailable");
    }
  }
  return (
    <div className="copy-link">
      <label className="field"><span className="field-label">Plan link</span><input readOnly value={url} onFocus={(event) => event.currentTarget.select()} /></label>
      <button className="secondary-button" type="button" onClick={copy}>Copy link</button>
      <span className="copy-status" role="status">{status === "copied" ? "Link copied" : status === "unavailable" ? "Copy is unavailable. Select the full link instead." : ""}</span>
    </div>
  );
}
