"use client";

import { useEffect } from "react";

const EDITABLE = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable=true]";

/**
 * Sets `data-keyboard="open"` on <html> while the phone's on-screen keyboard is actually showing.
 * Focus alone is not enough: on Android the back button closes the keyboard but the input keeps
 * focus. The keyboard shrinks the visible viewport (or the whole page, with
 * interactive-widget=resizes-content), so "an input is focused and the viewport lost over 25% of its
 * height" means the keyboard is open.
 */
export function useKeyboardOpen() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    let fullHeight = 0;
    const height = () => vv?.height ?? window.innerHeight;
    const update = () => {
      const h = height();
      fullHeight = Math.max(fullHeight, h);
      const focused = document.activeElement?.matches(EDITABLE) ?? false;
      const open = focused && h < fullHeight * 0.75;
      if (open) root.dataset.keyboard = "open";
      else delete root.dataset.keyboard;
    };
    // Rotating changes the full height; measure again
    const reset = () => {
      fullHeight = 0;
      setTimeout(update, 300);
    };
    update();
    vv?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    window.addEventListener("orientationchange", reset);
    return () => {
      vv?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      window.removeEventListener("orientationchange", reset);
      delete root.dataset.keyboard;
    };
  }, []);
}
