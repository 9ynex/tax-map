"use client";

import { motion } from "motion/react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { TaxBreakdown } from "@/src/calc/computeTaxFromChain";

/**
 * The gross income -> [component] -> ... -> net take-home waterfall from
 * docs/frontend.md #4. Each computed TaxComponent (federal income tax,
 * provincial income tax, CPP, EI, an abatement rebate, ...) is its own step
 * rather than a single generic "deductions" bucket — this jurisdiction's
 * data model computes per-component, and showing that structure (not
 * collapsing it) is exactly the "visible breakdown builds trust" goal the
 * doc calls out. consumption/property components that need an extra input
 * (a purchase amount, a home value) are shown separately as excluded, not
 * silently folded into the total.
 */
export function TaxBreakdownPanel({ breakdown }: { breakdown: TaxBreakdown }) {
  const computed = breakdown.components.filter((c) => c.computed);
  const excluded = breakdown.components.filter((c) => !c.computed);
  const maxMagnitude = Math.max(breakdown.grossIncome, 1);

  const rows = [
    { label: "Gross income", amount: breakdown.grossIncome, kind: "start" as const },
    ...computed.map((c) => ({
      label: c.name,
      amount: c.amount,
      kind: "component" as const,
      precision: c.precision,
    })),
    { label: "Take-home", amount: breakdown.netIncome, kind: "end" as const },
  ];

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex flex-col gap-1">
        {rows.map((row, i) => {
          const isBoundary = row.kind === "start" || row.kind === "end";
          const width = Math.min(100, (Math.abs(row.amount) / maxMagnitude) * 100);
          const isNegativeStep = row.kind === "component" && row.amount < 0;

          return (
            <motion.div
              key={`${row.label}-${i}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.25 }}
              className="flex items-center gap-3 py-1.5"
            >
              <div className="flex w-40 shrink-0 items-center gap-1.5 text-sm text-muted">
                <span className={isBoundary ? "font-medium text-foreground" : ""}>{row.label}</span>
                {row.kind === "component" && row.precision === "estimated" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Badge variant="warn">est.</Badge>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      This figure is an estimate, not an official statutory rate — see the
                      methodology page for sourcing.
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-surface-raised">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ delay: i * 0.05 + 0.1, duration: 0.4, ease: "easeOut" }}
                  className={
                    "h-full rounded-md " +
                    (isBoundary
                      ? "bg-accent"
                      : isNegativeStep
                        ? "bg-accent/70"
                        : "bg-warn/80")
                  }
                />
              </div>
              <span className="w-28 shrink-0 text-right font-mono text-sm tabular-nums text-foreground">
                {row.kind === "component" && row.amount < 0 ? "+" : row.kind === "component" ? "−" : ""}
                {formatCurrency(Math.abs(row.amount), breakdown.currency)}
              </span>
            </motion.div>
          );
        })}
      </div>

      {excluded.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
          {excluded.map((c) => (
            <div key={c.name} className="flex items-center justify-between text-sm">
              <span className="text-muted">{c.name}</span>
              <Badge variant="outline">{c.note ?? "not included"}</Badge>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm">
        <span className="text-muted">Effective rate</span>
        <span className="font-mono font-semibold text-foreground">
          {formatPercent(breakdown.effectiveRate)}
        </span>
      </div>
    </TooltipProvider>
  );
}
