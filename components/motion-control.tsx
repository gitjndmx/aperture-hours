"use client";

import { useEffect, useState } from "react";

export function MotionControl() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("motion-on", enabled);
    document.documentElement.classList.toggle("motion-off", !enabled);
    return () => {
      document.documentElement.classList.remove("motion-on", "motion-off");
    };
  }, [enabled]);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    if (!next && "getAnimations" in document) {
      document.getAnimations().forEach((animation) => {
        try {
          if (animation.effect?.getComputedTiming().iterations === Infinity) animation.cancel();
          else animation.finish();
        } catch {
          animation.cancel();
        }
      });
    }
  }

  return (
    <div className="motion-switch">
      <button
        type="button"
        className="motion-button"
        aria-pressed={enabled}
        onClick={toggle}
      >
        Motion <span aria-hidden="true">{enabled ? "On" : "Off"}</span>
        <span className="sr-only">is {enabled ? "on" : "off"}. Activate for {enabled ? "static" : "motion"} mode.</span>
      </button>
      <noscript><span className="noscript-note">Static mode · JavaScript is off</span></noscript>
    </div>
  );
}
