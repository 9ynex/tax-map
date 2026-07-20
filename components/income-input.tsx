"use client";

import * as React from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

import { Slider } from "@/components/ui/slider";

const MIN_INCOME = 0;
const MAX_INCOME = 500_000;
const STEP = 1_000;

/**
 * Controlled income slider + typed field. Deliberately has no URL/router
 * knowledge itself — the parent owns the live `income` value (so it can
 * recompute a map/list/breakdown on every drag frame with zero network
 * round-trip, per docs/frontend.md) and decides when to sync that value to
 * the URL via `onCommit` (slider release / blur / Enter, not every frame).
 */
export function IncomeInput({
  income,
  currencySymbol,
  onChange,
  onCommit,
}: {
  income: number;
  currencySymbol: string;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const motionValue = useMotionValue(income);
  const spring = useSpring(motionValue, { stiffness: 220, damping: 30 });
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString());

  React.useEffect(() => {
    motionValue.set(income);
  }, [income, motionValue]);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm text-muted">Annual income</span>
        <span className="font-mono text-4xl font-semibold tabular-nums text-foreground">
          {currencySymbol}
          <motion.span>{display}</motion.span>
        </span>
      </div>
      <Slider
        min={MIN_INCOME}
        max={MAX_INCOME}
        step={STEP}
        value={[income]}
        onValueChange={([value]) => value !== undefined && onChange(value)}
        onValueCommit={([value]) => value !== undefined && onCommit(value)}
        aria-label="Annual income"
      />
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={MIN_INCOME}
          max={MAX_INCOME}
          step={STEP}
          value={income}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (Number.isFinite(value)) onChange(value);
          }}
          onBlur={() => onCommit(income)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit(income);
          }}
          className="w-32 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Annual income (exact)"
        />
        <span className="text-xs text-muted">or type an exact amount</span>
      </div>
    </div>
  );
}
