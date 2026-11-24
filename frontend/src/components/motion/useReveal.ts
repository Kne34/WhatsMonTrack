"use client";

import type { RefObject } from "react";
import { DURATION, EASE, gsap, reducedMotion, ScrollTrigger, useGSAP } from "./gsap";

/**
 * Reveals the elements marked `data-reveal` inside `scope`: a short rise and fade (0.32 s) in small
 * staggered batches as they scroll into view, once. Cards above the fold reveal right away, which gives
 * the page its entrance. Each element is revealed only once, so data refreshing every 15 seconds or a
 * filter change never replays it; elements that appear later (after loading) reveal when they arrive.
 *
 * `key` changes when new elements may have appeared (data loaded, tab or filter changed).
 */
export function useReveal(scope: RefObject<HTMLElement | null>, key: unknown) {
  useGSAP(() => {
    if (reducedMotion() || !scope.current) return;
    const fresh = [...scope.current.querySelectorAll<HTMLElement>("[data-reveal]:not([data-revealed])")];
    if (!fresh.length) return;
    for (const el of fresh) el.dataset.revealed = "";
    gsap.set(fresh, { autoAlpha: 0, y: 12 });
    ScrollTrigger.batch(fresh, {
      once: true,
      start: "top 95%",
      interval: 0.05,
      onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: DURATION.enter, ease: EASE, stagger: 0.045, overwrite: true, clearProps: "transform,opacity,visibility" }),
    });
  }, { scope, dependencies: [key] });
}
