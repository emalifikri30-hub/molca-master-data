import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type Row,
  type SortingState,
  type Table as TanTable,
  type VisibilityState,
  type RowSelectionState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Columns3,
  ListFilter,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/* ------------------------------------------------------------------ */
/* Status cell                                                         */
/* ------------------------------------------------------------------ */

/** Machine / work-order states. Dot colors are the universal st-* codes. */
export const STATUS_META = {
  running: { label: "Running", dot: "bg-st-run" },
  idle: { label: "Idle", dot: "bg-st-small" },
  down: { label: "Down", dot: "bg-st-unplanned" },
  setup: { label: "Setup", dot: "bg-st-planned" },
  offline: { label: "Offline", dot: "bg-st-off" },
} as const;
export type Status = keyof typeof STATUS_META;

/** Neutral chip with a colored status dot. Text always names the state. */
export function StatusCell({ status, className }: { status: Status; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border bg-card px-2 text-[12px] font-medium",
        className,
      )}
    >
      <span className={cn("size-2 rounded-full", m.dot)} aria-hidden />
      {m.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Column helpers                                                      */
/* ------------------------------------------------------------------ */

/** Filter fn for faceted (multi-value) filters: keeps rows whose value is in the selected list. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const facetedFilter: FilterFn<any> = (row, id, value: string[]) =>
  !value?.length || value.includes(String(row.getValue(id)));

/** Sortable header: click to toggle asc → desc → none. */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
  align = "left",
}: {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
  align?: "left" | "right";
}) {
  if (!column.getCanSort())
    return <span className={cn(align === "right" && "block text-right", className)}>{title}</span>;
  const dir = column.getIsSorted();
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        "-mx-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 font-medium outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
        dir && "text-foreground",
        align === "right" && "ml-auto flex flex-row-reverse",
        className,
      )}
      aria-label={`Sort by ${title}`}
    >
      {title}
      <Icon className={cn("size-3.5", !dir && "opacity-50")} />
    </button>
  );
}

/** Checkbox selection column. Put it first in `columns`. */
export function selectColumn<TData>(): ColumnDef<TData> {
  return {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all rows on this page"
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
              ? "indeterminate"
              : false
        }
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        onClick={(e) => e.stopPropagation()}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 36,
  };
}

/* ------------------------------------------------------------------ */
/* Toolbar pieces                                                      */
/* ------------------------------------------------------------------ */

export type FacetedFilterDef = {
  columnId: string;
  title: string;
  options: { label: string; value: string; icon?: React.ReactNode }[];
};

function FacetedFilter<TData>({ table, def }: { table: TanTable<TData>; def: FacetedFilterDef }) {
  const column = table.getColumn(def.columnId);
  if (!column) return null;
  const selected = new Set((column.getFilterValue() as string[] | undefined) ?? []);
  const counts = column.getFacetedUniqueValues();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("border-dashed", selected.size && "border-solid")}
        >
          <ListFilter />
          {def.title}
          {selected.size > 0 && (
            <span className="ml-0.5 rounded-sm bg-highlight-soft px-1.5 text-[11px] font-semibold text-highlight tabular-nums">
              {selected.size}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>{def.title}</DropdownMenuLabel>
        {def.options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.has(o.value)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(v) => {
              const next = new Set(selected);
              if (v) next.add(o.value);
              else next.delete(o.value);
              column.setFilterValue(next.size ? [...next] : undefined);
            }}
          >
            {o.icon}
            <span className="flex-1">{o.label}</span>
            <span className="text-[11.5px] text-muted-foreground tabular-nums">
              {counts.get(o.value) ?? 0}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        {selected.size > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => column.setFilterValue(undefined)}>
              Clear filter
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ColumnVisibility<TData>({ table }: { table: TanTable<TData> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3 />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        {table
          .getAllColumns()
          .filter((c) => c.getCanHide())
          .map((c) => (
            <DropdownMenuCheckboxItem
              key={c.id}
              checked={c.getIsVisible()}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(v) => c.toggleVisibility(!!v)}
            >
              {(c.columnDef.meta as { label?: string } | undefined)?.label ?? c.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* DataTable                                                           */
/* ------------------------------------------------------------------ */

export type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Placeholder for the global search box. Omit `searchable` to hide it. */
  searchPlaceholder?: string;
  searchable?: boolean;
  /** Faceted multi-select filters shown in the toolbar */
  filters?: FacetedFilterDef[];
  /** Show the column visibility menu */
  columnToggle?: boolean;
  /** Rows per page; 0 disables pagination */
  pageSize?: number;
  pageSizeOptions?: number[];
  initialSorting?: SortingState;
  initialVisibility?: VisibilityState;
  /** Bulk actions shown when rows are selected */
  bulkActions?: (rows: Row<TData>[], clear: () => void) => React.ReactNode;
  onRowClick?: (row: TData) => void;
  /** Extra toolbar content on the right (e.g. Export, New work order) */
  toolbar?: React.ReactNode;
  density?: "compact" | "default";
  emptyMessage?: React.ReactNode;
  getRowId?: (row: TData, index: number) => string;
  className?: string;
};

/** Sortable, filterable, paginated table with column visibility and row selection. Built on TanStack Table + shadcn Table. */
export function DataTable<TData>({
  columns,
  data,
  searchPlaceholder = "Search…",
  searchable = true,
  filters = [],
  columnToggle = true,
  pageSize = 10,
  pageSizeOptions = [10, 20, 50],
  initialSorting = [],
  initialVisibility = {},
  bulkActions,
  onRowClick,
  toolbar,
  density = "default",
  emptyMessage = "No results.",
  getRowId,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(initialVisibility);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter, columnVisibility, rowSelection },
    getRowId,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    ...(pageSize > 0 ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    initialState: { pagination: { pageSize: pageSize || 10, pageIndex: 0 } },
    globalFilterFn: "includesString",
  });

  const selected = table.getSelectedRowModel().rows;
  const filtered = columnFilters.length > 0 || globalFilter.length > 0;
  const rows = table.getRowModel().rows;
  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize: ps } = table.getState().pagination;
  const cellPad = density === "compact" ? "py-1.5" : "py-2.5";

  return (
    <div className={cn("w-full", className)}>
      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {selected.length > 0 && bulkActions ? (
          <div className="flex h-8 flex-1 items-center gap-2 rounded-lg bg-highlight-soft px-2.5 text-[13px]">
            <span className="font-medium text-highlight tabular-nums">
              {selected.length} selected
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              {bulkActions(selected, () => table.resetRowSelection())}
            </div>
          </div>
        ) : (
          <>
            {searchable && (
              <div className="relative w-full max-w-60">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-8 pl-8"
                  aria-label="Search table"
                />
              </div>
            )}
            {filters.map((f) => (
              <FacetedFilter key={f.columnId} table={table} def={f} />
            ))}
            {filtered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  table.resetColumnFilters();
                  setGlobalFilter("");
                }}
              >
                Reset
                <X />
              </Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              {toolbar}
              {columnToggle && <ColumnVisibility table={table} />}
            </div>
          </>
        )}
      </div>

      {/* table */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader className="bg-subtle">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    style={h.column.id === "select" ? { width: 36 } : undefined}
                    className="h-9 text-xs text-muted-foreground"
                    aria-sort={
                      h.column.getIsSorted() === "asc"
                        ? "ascending"
                        : h.column.getIsSorted() === "desc"
                          ? "descending"
                          : undefined
                    }
                  >
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    "data-[state=selected]:bg-highlight-soft/60",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn("text-[13px]", cellPad)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="h-32 text-center text-[13px] text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* footer / pagination */}
      {pageSize > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-muted-foreground">
          <span className="tabular-nums">
            {selected.length > 0 ? `${selected.length} of ${total} selected · ` : ""}
            {total === 0
              ? "0"
              : `${pageIndex * ps + 1}–${Math.min((pageIndex + 1) * ps, total)}`}{" "}
            of {total} rows
          </span>
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  Rows per page: <span className="text-foreground tabular-nums">{ps}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {pageSizeOptions.map((n) => (
                  <DropdownMenuCheckboxItem
                    key={n}
                    checked={n === ps}
                    onCheckedChange={() => table.setPageSize(n)}
                  >
                    {n}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="tabular-nums">
              Page {pageIndex + 1} of {Math.max(1, table.getPageCount())}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="First page"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronsLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Previous page"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Next page"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <ChevronRight />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Last page"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <ChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export type { ColumnDef } from "@tanstack/react-table";
