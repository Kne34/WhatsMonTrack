import { Suspense } from "react";
import AuthWrapper from "@/components/AuthWrapper";

export default function Home() {
  return (
    // The dashboard reads the active tab from the URL (useSearchParams); Next.js recommends a
    // Suspense boundary around such client components so the rest can be prerendered.
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AuthWrapper />
    </Suspense>
  );
}
