"use client";

import React, { useRef } from "react";
import { motion, type HTMLMotionProps, type Transition } from "motion/react";
import { cn } from "@/lib/utils";
import { DURATION, EASE, gsap, reducedMotion, useGSAP } from "./gsap";

/** Motion's timing for UI state: a quick spring without bounce (about 200 ms) */
export const SPRING: Transition = { type: "spring", stiffness: 520, damping: 42, mass: 0.7 };
export const FADE: Transition = { duration: 0.2, ease: [0.22, 1, 0.36, 1] };

/**
 * The raised thumb of a segmented control or the tinted row of the sidebar: one per group, sliding to the
 * chosen item (Motion layoutId). Put it inside the chosen item, which must be `relative`.
 */
export function ActiveIndicator({ layoutId, className }: { layoutId: string; className?: string }) {
  return <motion.span layoutId={layoutId} transition={SPRING} aria-hidden className={cn("pointer-events-none absolute inset-0", className)} />;
}

/** A row that fades/slides in when added and out when removed; wrap the list in <AnimatePresence initial={false}>. */
export const MotionListItem = React.forwardRef<HTMLDivElement, HTMLMotionProps<"div">>(function MotionListItem(props, ref) {
  return (
    <motion.div
      ref={ref}
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12, transition: { duration: 0.18 } }}
      transition={FADE}
      {...props}
    />
  );
});

/**
 * A progress fill (GSAP): grows from empty on first show, then glides to new values. Uses scaleX, not
 * width, so only the compositor works. `value` is 0..1.
 */
export function AnimatedBar({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef(false);
  const v = Math.max(0, Math.min(1, value));
  useGSAP(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) { gsap.set(el, { scaleX: v }); return; }
    if (!shown.current) {
      shown.current = true;
      gsap.fromTo(el, { scaleX: 0 }, { scaleX: v, duration: 0.5, ease: EASE, delay: 0.1 });
    } else {
      gsap.to(el, { scaleX: v, duration: DURATION.enter, ease: EASE, overwrite: true });
    }
  }, { dependencies: [v] });
  return <div ref={ref} className={cn("h-full w-full origin-left", className)} style={{ transform: `scaleX(${v})` }} />;
}

/**
 * A thin green/red wash that fades out when `value` goes up/down (live prices). The wash is its own layer
 * (opacity only); the content above it never moves.
 */
export function PriceFlash({ value, children, className }: { value: number | null | undefined; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useGSAP(() => {
    const before = prev.current;
    prev.current = value;
    const el = ref.current;
    if (!el || before == null || value == null || before === value || reducedMotion()) return;
    el.dataset.dir = value > before ? "up" : "down";
    gsap.fromTo(el, { opacity: 1 }, { opacity: 0, duration: 1.1, ease: "power2.out", overwrite: true });
  }, { dependencies: [value] });
  return (
    <span className={cn("relative isolate inline-block", className)}>
      <span ref={ref} aria-hidden className="pointer-events-none absolute -inset-x-1.5 -inset-y-0.5 -z-10 rounded-md opacity-0 data-[dir=down]:bg-expense/15 data-[dir=up]:bg-income/15" />
      {children}
    </span>
  );
}
