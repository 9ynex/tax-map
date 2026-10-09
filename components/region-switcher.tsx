"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import type { NavTarget } from "@/src/countries/listNavTargets";

/**
 * Persistent header switcher — the fast path for someone who already knows
 * where they're going, vs. the world map's discovery path (docs/frontend.md
 * decision: build both, switcher first since it reuses the exact combobox
 * pattern the compare picker already needed). Available on every page via
 * app/layout.tsx.
 */
export function RegionSwitcher({ targets }: { targets: NavTarget[] }) {
  const router = useRouter();

  const items: ComboboxItem[] = React.useMemo(
    () => targets.map((t) => ({ id: t.id, label: t.label, group: t.group })),
    [targets],
  );

  const targetsById = React.useMemo(() => new Map(targets.map((t) => [t.id, t])), [targets]);

  const select = React.useCallback(
    (item: ComboboxItem) => {
      const target = targetsById.get(item.id);
      if (target) router.push(target.href);
    },
    [targetsById, router],
  );

  return (
    <Combobox
      items={items}
      onSelect={select}
      placeholder="Jump to a country or region…"
      ariaLabel="Jump to a country or region"
      align="end"
      trigger={
        <Button variant="outline" size="sm">
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Jump to…</span>
        </Button>
      }
    />
  );
}
