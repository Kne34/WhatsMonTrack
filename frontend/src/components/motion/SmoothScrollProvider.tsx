"use client";

import React, { useEffect, useRef } from "react";
import Lenis from "lenis";
import { MotionConfig } from "motion/react";
import { gsap, reducedMotion, ScrollTrigger } from "./gsap";

/**
 * Smooth scrolling for the dashboard, and the shared motion settings.
 *
 * The page scrolls the window (the sidebar is `fixed`, the content flows normally), so Lenis needs no
 * wrapper/content and ScrollTrigger keeps its default scroller (the window).
 * - Mouse and trackpad only: touch screens keep the phone's own scrolling, which already feels right.
 * - Off with prefers-reduced-motion, and where `enabled` is false (the chart and chat pages fill the screen).
 * - Driven by GSAP's ticker, so ScrollTrigger and Lenis read the same frame.
 * - Stops while something locks the page (an open dialog sets overflow: hidden on <html>), so wheeling
 *   over the backdrop can't move the page underneath.
 * - Back to the top when `resetKey` (the tab) changes, then every ScrollTrigger measures again.
 * Elements that scroll by themselves carry data-lenis-prevent (or -horizontal for wide tables).
 */
export function SmoothScrollProvider({ enabled, resetKey, children }: { enabled: boolean; resetKey: string; children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (!enabled || reducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    const lenis = new Lenis({ autoRaf: false, lerp: 0.14, smoothWheel: true, syncTouch: false });
    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // A dialog or menu locked the page: stop until it's unlocked
    const locked = () => [document.documentElement, document.body].some((el) => getComputedStyle(el).overflow === "hidden" || getComputedStyle(el).overflowY === "hidden");
    const observer = new MutationObserver(() => (locked() ? lenis.stop() : lenis.start()));
    for (const el of [document.documentElement, document.body]) observer.observe(el, { attributes: true, attributeFilter: ["style", "class", "data-base-ui-scroll-locked"] });

    return () => {
      observer.disconnect();
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [enabled]);

  // A new tab starts at the top
  useEffect(() => {
    if (lenisRef.current) lenisRef.current.scrollTo(0, { immediate: true, force: true });
    else window.scrollTo(0, 0);
    ScrollTrigger.refresh();
  }, [resetKey]);

  // Data arriving, filters and tabs change the page's height: ScrollTrigger measures again (once per frame at most)
  useEffect(() => {
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => ScrollTrigger.refresh());
    });
    observer.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // Motion follows the OS setting too
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
