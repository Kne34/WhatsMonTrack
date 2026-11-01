// Shared by the server layout (inline <head> script) and the client theme switcher.
// Kept out of the "use client" module so the server gets the real string, not a client reference.

export const THEME_STORAGE_KEY = "wmt.theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs synchronously in <head> before first paint, so a saved or system dark preference
 * never flashes the light theme (Next.js "Preventing flash before hydration" guide).
 * Must match applyTheme() in components/theme.tsx.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var d=p==="dark"||(p!=="light"&&matchMedia("${DARK_QUERY}").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})()`;
