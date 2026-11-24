"use client";

/**
 * One place that registers GSAP's plugins, so every component imports gsap and ScrollTrigger from here.
 *
 * Who animates what (one library per element, never two on the same transform/opacity):
 * - Lenis: the page's smooth wheel scrolling (window), see SmoothScrollProvider.
 * - Motion: UI state: sliding indicators (layoutId), items entering/leaving lists, toasts.
 * - GSAP + ScrollTrigger: data: numbers counting up, reveals of sections, progress fills, price flashes.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Durations from the plan: micro 150-250 ms, entrances 250-400 ms, numbers 500-800 ms */
export const DURATION = { micro: 0.2, enter: 0.32, number: 0.6 } as const;
export const EASE = "power3.out";

/** The OS asks for less motion: skip movement entirely (values just appear) */
export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export { gsap, ScrollTrigger, useGSAP };
