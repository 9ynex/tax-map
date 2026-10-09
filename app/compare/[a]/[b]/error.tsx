"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * A real error boundary on this route isn't just defensive polish — without
 * one, a rare hydration failure on this page (two independent
 * computeTaxFromChain calls streamed side by side) left the comparison
 * panel stuck showing nothing forever instead of surfacing an error or
 * recovering, since there was no boundary nearby to catch it.
 */
export default function CompareError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-6">
      <p className="text-sm text-foreground">
        Something went wrong loading this comparison.
      </p>
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
