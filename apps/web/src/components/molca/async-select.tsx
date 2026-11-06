"use client";

import * as React from "react";
import { Check, ChevronsUpDown, RotateCw, SearchX, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

export type AsyncOption = {
  value: string;
  label: string;
  description?: string;
  meta?: React.ReactNode;
  disabled?: boolean;
};
export type LoadOptions = (query: string, signal: AbortSignal) => Promise<AsyncOption[]>;

/* ------------------------------------------------------------------ */
/* Hook: debounced loader with abort + loading / error state           */
/* ------------------------------------------------------------------ */

export function useAsyncOptions(
  loadOptions: LoadOptions,
  query: string,
  { debounceMs = 300, minChars = 0, enabled = true } = {},
) {
  const [options, setOptions] = React.useState<AsyncOption[]>([]);
  const [status, setStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const loaderRef = React.useRef(loadOptions);
  React.useEffect(() => {
    loaderRef.current = loadOptions;
  });

  React.useEffect(() => {
    if (!enabled) return;
    if (query.length < minChars) {
      setStatus("idle");
      setOptions([]);
      return;
    }
    const ctrl = new AbortController();
    setStatus("loading");
    const t = setTimeout(() => {
      loaderRef
        .current(query, ctrl.signal)
        .then((res) => {
          if (ctrl.signal.aborted) return;
          setOptions(res);
          setStatus("success");
          setError(null);
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return;
          setStatus("error");
          setError(e instanceof Error ? e.message : "Something went wrong");
        });
    }, debounceMs);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, debounceMs, minChars, enabled, nonce]);

  return { options, status, error, retry: () => setNonce((n) => n + 1) };
}

/* ------------------------------------------------------------------ */
/* Panel states (exported so docs / custom pickers can reuse them)     */
/* ------------------------------------------------------------------ */

export function AsyncSelectState({
  state,
  query,
  error,
  minChars = 0,
  onRetry,
}: {
  state: "loading" | "empty" | "error" | "idle";
  query?: string;
  error?: string | null;
  minChars?: number;
  onRetry?: () => void;
}) {
  if (state === "loading")
    return (
      <div className="grid gap-1 p-1" aria-busy="true" aria-live="polite">
        <div className="flex items-center gap-2 px-2 py-1.5 text-[12.5px] text-muted-foreground">
          <Spinner className="size-3.5" />
          Searching…
        </div>
        {[72, 56, 64].map((w) => (
          <div key={w} className="flex items-center gap-2 px-2 py-1.5">
            <Skeleton className="h-3.5" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    );
  if (state === "error")
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center" role="alert">
        <TriangleAlert className="size-5 text-danger" />
        <div className="text-[13px] font-medium">Couldn’t load results</div>
        {error && <div className="text-[12px] text-muted-foreground">{error}</div>}
        {onRetry && (
          <Button size="xs" variant="outline" onClick={onRetry}>
            <RotateCw />
            Retry
          </Button>
        )}
      </div>
    );
  if (state === "idle")
    return (
      <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
        Type at least {minChars} characters to search
      </div>
    );
  return (
    <div className="flex flex-col items-center gap-1.5 px-4 py-6 text-center">
      <SearchX className="size-5 text-muted-foreground" />
      <div className="text-[13px] font-medium">No results{query ? <> for “{query}”</> : null}</div>
      <div className="text-[12px] text-muted-foreground">Check the ID or try another keyword.</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared list                                                         */
/* ------------------------------------------------------------------ */

type ListProps = {
  loadOptions: LoadOptions;
  isSelected: (o: AsyncOption) => boolean;
  onPick: (o: AsyncOption) => void;
  searchPlaceholder: string;
  debounceMs: number;
  minChars: number;
  open: boolean;
  groupLabel?: string;
};

function AsyncList({
  loadOptions,
  isSelected,
  onPick,
  searchPlaceholder,
  debounceMs,
  minChars,
  open,
  groupLabel,
}: ListProps) {
  const [query, setQuery] = React.useState("");
  const { options, status, error, retry } = useAsyncOptions(loadOptions, query, {
    debounceMs,
    minChars,
    enabled: open,
  });
  return (
    <Command shouldFilter={false}>
      <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder} />
      <CommandList>
        {status === "loading" && <AsyncSelectState state="loading" />}
        {status === "error" && <AsyncSelectState state="error" error={error} onRetry={retry} />}
        {status === "idle" && minChars > 0 && <AsyncSelectState state="idle" minChars={minChars} />}
        {status === "success" && options.length === 0 && (
          <AsyncSelectState state="empty" query={query} />
        )}
        {status === "success" && options.length > 0 && (
          <CommandGroup heading={groupLabel}>
            {options.map((o) => {
              const sel = isSelected(o);
              return (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  disabled={o.disabled}
                  onSelect={() => onPick(o)}
                  className="gap-2"
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      sel ? "text-highlight opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{o.label}</div>
                    {o.description && (
                      <div className="truncate text-[12px] text-muted-foreground">
                        {o.description}
                      </div>
                    )}
                  </div>
                  {o.meta && (
                    <span className="shrink-0 text-[12px] text-muted-foreground">{o.meta}</span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}

/* ------------------------------------------------------------------ */
/* Single                                                              */
/* ------------------------------------------------------------------ */

type BaseProps = {
  loadOptions: LoadOptions;
  placeholder?: string;
  searchPlaceholder?: string;
  debounceMs?: number;
  /** Minimum characters before searching (0 = load on open) */
  minChars?: number;
  disabled?: boolean;
  invalid?: boolean;
  groupLabel?: string;
  className?: string;
  "aria-label"?: string;
};

export type AsyncSelectProps = BaseProps & {
  value: AsyncOption | null;
  onValueChange: (v: AsyncOption | null) => void;
  clearable?: boolean;
};

/** Debounced server-search combobox (single value). */
export function AsyncSelect({
  value,
  onValueChange,
  loadOptions,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  debounceMs = 300,
  minChars = 0,
  disabled,
  invalid,
  clearable = true,
  groupLabel,
  className,
  ...rest
}: AsyncSelectProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-label={rest["aria-label"]}
          disabled={disabled}
          className={cn(
            "h-9 w-72 justify-between px-3 font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value ? value.label : placeholder}</span>
          <span className="flex items-center gap-1">
            {clearable && value && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onValueChange(null);
                }}
                className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </span>
            )}
            <ChevronsUpDown className="size-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <AsyncList
          open={open}
          loadOptions={loadOptions}
          searchPlaceholder={searchPlaceholder}
          debounceMs={debounceMs}
          minChars={minChars}
          groupLabel={groupLabel}
          isSelected={(o) => o.value === value?.value}
          onPick={(o) => {
            onValueChange(o.value === value?.value ? null : o);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Multi                                                               */
/* ------------------------------------------------------------------ */

export type AsyncMultiSelectProps = BaseProps & {
  value: AsyncOption[];
  onValueChange: (v: AsyncOption[]) => void;
  /** Chips shown before collapsing into "+n" */
  maxChips?: number;
  /** Maximum selectable items */
  max?: number;
};

/** Debounced server-search combobox with multiple values rendered as removable chips. */
export function AsyncMultiSelect({
  value,
  onValueChange,
  loadOptions,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  debounceMs = 300,
  minChars = 0,
  disabled,
  invalid,
  maxChips = 3,
  max,
  groupLabel,
  className,
  ...rest
}: AsyncMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const remove = (v: string) => onValueChange(value.filter((x) => x.value !== v));
  const shown = value.slice(0, maxChips);
  const extra = value.length - shown.length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="combobox"
          tabIndex={disabled ? -1 : 0}
          aria-expanded={open}
          aria-disabled={disabled || undefined}
          aria-invalid={invalid || undefined}
          aria-label={rest["aria-label"]}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && value.length) remove(value[value.length - 1].value);
          }}
          className={cn(
            "flex min-h-9 w-96 cursor-pointer flex-wrap items-center gap-1 rounded-lg border bg-background px-1.5 py-1 text-sm outline-none transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:border-input dark:bg-input/30",
            disabled && "pointer-events-none opacity-50",
            className,
          )}
        >
          {value.length === 0 && (
            <span className="px-1.5 text-muted-foreground">{placeholder}</span>
          )}
          {shown.map((o) => (
            <span
              key={o.value}
              className="inline-flex h-6 items-center gap-1 rounded-md border bg-secondary pl-2 pr-0.5 text-[12.5px] font-medium"
            >
              {o.label}
              <button
                type="button"
                aria-label={`Remove ${o.label}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(o.value);
                }}
                className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {extra > 0 && (
            <span className="inline-flex h-6 items-center rounded-md bg-muted px-2 text-[12px] font-medium text-muted-foreground tabular-nums">
              +{extra}
            </span>
          )}
          <ChevronsUpDown className="ml-auto mr-1 size-4 shrink-0 opacity-50" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <AsyncList
          open={open}
          loadOptions={loadOptions}
          searchPlaceholder={searchPlaceholder}
          debounceMs={debounceMs}
          minChars={minChars}
          groupLabel={groupLabel}
          isSelected={(o) => value.some((v) => v.value === o.value)}
          onPick={(o) => {
            if (value.some((v) => v.value === o.value)) remove(o.value);
            else if (!max || value.length < max) onValueChange([...value, o]);
          }}
        />
        {value.length > 0 && (
          <div className="flex items-center justify-between border-t px-3 py-1.5 text-[12px] text-muted-foreground">
            <span className="tabular-nums">
              {value.length}
              {max ? ` / ${max}` : ""} selected
            </span>
            <button
              type="button"
              className="font-medium text-highlight hover:underline"
              onClick={() => onValueChange([])}
            >
              Clear all
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
