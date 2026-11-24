import type { Metadata, Viewport } from "next";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";
import { ThemeWatcher } from "@/components/theme";
import { LanguageProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "WhatsMonTrack",
  description: "WhatsApp Expense Tracker Dashboard",
};

// Mobile browser chrome follows the system theme (matches --background in globals.css)
export const viewport: Viewport = {
  // The on-screen keyboard shrinks the page instead of covering it, so the chat input stays visible (Android Chrome)
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F2F7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script sets class="dark" / color-scheme before React hydrates, so the DOM
    // differs from the server HTML on purpose; suppressHydrationWarning keeps the DOM.
    <html
      lang="id"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeWatcher />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
