"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * "N selected — compare" bar (docs/frontend.md #5) — pinning lives in the
 * URL (`pins` param) so it's shareable, and comparison is capped at two
 * regions for v1's side-by-side layout.
 */
export function CompareBar({
  pinnedNames,
  onClear,
  onRemove,
  onCompare,
}: {
  pinnedNames: { id: string; name: string }[];
  onClear: () => void;
  onRemove: (id: string) => void;
  onCompare: () => void;
}) {
  return (
    <AnimatePresence>
      {pinnedNames.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          className="sticky bottom-4 z-30 mt-2 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised px-4 py-3 shadow-lg"
        >
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-foreground">{pinnedNames.length} selected</span>
            <div className="flex flex-wrap gap-1.5">
              {pinnedNames.map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs text-muted"
                >
                  {p.name}
                  <button
                    type="button"
                    onClick={() => onRemove(p.id)}
                    aria-label={`Remove ${p.name}`}
                    className="hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear
            </Button>
            <Button size="sm" disabled={pinnedNames.length < 2} onClick={onCompare}>
              Compare
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
