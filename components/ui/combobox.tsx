"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboboxItem {
  id: string;
  label: string;
  /** Items sharing a group render under one header, in first-seen order. */
  group?: string;
  /** Small trailing text, e.g. a currency code or level label. */
  meta?: string;
}

/**
 * Generic searchable popover list — a country/region picker today
 * (components/compare-picker.tsx, components/region-switcher.tsx), but not
 * coupled to either; anything reducible to {id, label, group?, meta?} can
 * use it. Extracted once a second caller needed the identical
 * search/group/keyboard-nav interaction rather than duplicating it.
 */
export function Combobox({
  items,
  onSelect,
  trigger,
  placeholder = "Search…",
  emptyMessage = "No results found.",
  ariaLabel = "Search",
  align = "start",
}: {
  items: ComboboxItem[];
  onSelect: (item: ComboboxItem) => void;
  trigger: React.ReactNode;
  placeholder?: string;
  emptyMessage?: string;
  ariaLabel?: string;
  align?: "start" | "end" | "center";
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlighted, setHighlighted] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) || (item.group?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  const grouped = React.useMemo(() => {
    const groups = new Map<string, ComboboxItem[]>();
    for (const item of filtered) {
      const key = item.group ?? "";
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  React.useEffect(() => {
    setHighlighted(0);
  }, [filtered]);

  const select = React.useCallback(
    (item: ComboboxItem) => {
      setOpen(false);
      setQuery("");
      onSelect(item);
    },
    [onSelect],
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        className="p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlighted((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const item = filtered[highlighted];
                if (item) select(item);
              }
            }}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-muted">{emptyMessage}</p>
          )}
          {grouped.map(([group, groupItems]) => (
            <div key={group || "_ungrouped"}>
              {group && <div className="px-3 pt-2 pb-1 text-xs font-medium text-muted">{group}</div>}
              {groupItems.map((item) => {
                const index = filtered.indexOf(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => select(item)}
                    onMouseEnter={() => setHighlighted(index)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-foreground",
                      index === highlighted && "bg-accent/15",
                    )}
                  >
                    {item.label}
                    {item.meta && <span className="text-xs text-muted">{item.meta}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
