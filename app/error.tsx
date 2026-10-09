"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * App-wide fallback error boundary. Any route without its own more-specific
 * error.tsx (like app/compare/[a]/[b]/error.tsx) falls back to this one —
 * cheap, standard App Router hygiene, and per that route's own error.tsx
 * comment, the mere presence of a boundary can be load-bearing for
 * Suspense-heavy routes, not just a nicety.
 */
export default function GlobalPageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-6">
      <p className="text-sm text-foreground">Something went wrong loading this page.</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/">Back to World map</Link>
        </Button>
      </div>
    </div>
  );
}
