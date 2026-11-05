import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";
import { ThemeWatcher } from "@/components/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WhatsMonTrack",
  description: "WhatsApp Expense Tracker Dashboard",
};

// Mobile browser chrome follows the system theme (matches --background in globals.css)
export const viewport: Viewport = {
  // The on-screen keyboard shrinks the page instead of covering it, so the chat input stays visible (Android Chrome)
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script sets class="dark" / color-scheme before React hydrates, so the DOM
    // differs from the server HTML on purpose; suppressHydrationWarning keeps the DOM.
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeWatcher />
        {children}
      </body>
    </html>
  );
}
