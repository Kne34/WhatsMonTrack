"use client";

import React, { useRef } from "react";
import { DURATION, gsap, reducedMotion, useGSAP } from "./gsap";

/**
 * A financial figure that counts up from 0 the first time it shows (0.6 s), then simply shows new values:
 * live prices refresh every 10 seconds, and numbers that keep rolling would only distract.
 * Screen readers get the final value at once; the rolling digits are hidden from them.
 */
export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const counted = useRef(false);

  useGSAP(() => {
    const el = ref.current;
    if (!el) return;
    if (counted.current || reducedMotion() || !Number.isFinite(value)) {
      el.textContent = format(value);
      return;
    }
    counted.current = true;
    const proxy = { v: 0 };
    el.textContent = format(0);
    const tween = gsap.to(proxy, {
      v: value,
      duration: DURATION.number,
      ease: "power2.out",
      onUpdate: () => { el.textContent = format(proxy.v); },
      // Ends exactly on the value (rounding during the tween)
      onComplete: () => { el.textContent = format(value); },
    });
    // Unmounted mid-count (React StrictMode does that once in development): count again next time
    return () => { if (tween.isActive()) counted.current = false; };
  }, { dependencies: [value, format(value)] });

  return (
    <span className={className}>
      <span ref={ref} aria-hidden className="tabular-nums">{format(value)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
