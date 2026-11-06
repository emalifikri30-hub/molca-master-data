import { useTranslation } from "react-i18next";
import { CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { useItemCosts, type ItemCost } from "@/lib/md";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";

// Price history of an item (Master Data owns the valuation): the moving-average unit cost as a step line over time,
// each receipt price as a dot, and the list of changes with who, why and the delivery note. Same view as the
// Maintenance parts page, so a buyer and a storekeeper read it the same way.

const qty = (v: number | string) =>
  Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 });
const idr = (v: number) => `Rp ${Math.round(v).toLocaleString("id-ID")}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

function CostHistory({ itemId, current }: { itemId: string; current: number | null }) {
  const { t } = useTranslation();
  const { data } = useItemCosts(itemId);
  if (!data?.length)
    return <p className="text-[12.5px] text-muted-foreground">{t("parts.c.noHistory")}</p>;
  const asc = [...data].reverse();
  const first = asc[0]!;
  const rows = [
    ...(first.oldCost != null
      ? [
          {
            x: new Date(first.at).getTime() - 30 * 86_400_000,
            avg: Number(first.oldCost),
            price: null as number | null,
          },
        ]
      : []),
    ...asc.map((c) => ({
      x: new Date(c.at).getTime(),
      avg: Number(c.newCost),
      price: c.price == null ? null : Number(c.price),
    })),
    { x: Date.now(), avg: current ?? Number(asc.at(-1)!.newCost), price: null },
  ];
  const vals = rows.flatMap((r) => [r.avg, r.price ?? r.avg]);
  const lo = Math.min(...vals),
    hi = Math.max(...vals);
  const pad = (hi - lo || hi * 0.1) * 0.2;
  const base = rows[0]!.avg;
  const total = base ? (rows.at(-1)!.avg - base) / base : null;
  const short = (v: number) =>
    v >= 1e6
      ? `${(v / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`
      : `${Math.round(v / 1e3)} rb`;
  const config = {
    avg: { label: t("parts.c.avg"), color: "var(--chart-1)" },
    price: { label: t("parts.c.price"), color: "var(--foreground)" },
  } satisfies ChartConfig;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-[var(--chart-1)]" />
            {t("parts.c.avg")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full border-2 border-foreground" />
            {t("parts.c.price")}
          </span>
        </span>
        {total != null ? (
          <span>
            {t("parts.c.since", { date: fmtDate(new Date(rows[0]!.x).toISOString()) })}{" "}
            <span
              className="font-medium tabular-nums"
              style={{
                color: total > 0 ? "var(--sys-red)" : total < 0 ? "var(--sys-green)" : undefined,
              }}
            >
              {total > 0 ? "+" : ""}
              {(total * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
            </span>
          </span>
        ) : null}
      </div>
      <ChartContainer config={config} className="aspect-auto h-40 w-full">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis
            dataKey="x"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) =>
              new Date(v).toLocaleDateString("id-ID", { month: "short", year: "2-digit" })
            }
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={40}
          />
          <YAxis
            domain={[Math.max(0, lo - pad), hi + pad]}
            tickFormatter={short}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <ChartTooltip
            content={({ active, payload }) => {
              const r = active
                ? (payload?.[0]?.payload as (typeof rows)[number] | undefined)
                : undefined;
              return r ? (
                <div className="rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
                  <div className="mb-1 font-medium">{fmtDate(new Date(r.x).toISOString())}</div>
                  <div>
                    {t("parts.c.avg")}:{" "}
                    <span className="font-semibold tabular-nums">{idr(r.avg)}</span>
                  </div>
                  {r.price != null ? (
                    <div>
                      {t("parts.c.price")}:{" "}
                      <span className="font-semibold tabular-nums">{idr(r.price)}</span>
                    </div>
                  ) : null}
                </div>
              ) : null;
            }}
          />
          <Line
            dataKey="avg"
            type="stepAfter"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="price"
            stroke="none"
            dot={{ r: 3.5, fill: "var(--card)", stroke: "var(--foreground)", strokeWidth: 1.5 }}
            isAnimationActive={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ChartContainer>
      <CostList data={data} />
    </div>
  );
}

/** The latest cost changes, newest first, with the change against the cost before each. */
function CostList({ data }: { data: ItemCost[] }) {
  const { t } = useTranslation();
  return (
    <ul className="divide-y rounded-lg border text-[12.5px]">
      {data.slice(0, 4).map((c) => {
        const from = c.oldCost == null ? null : Number(c.oldCost);
        const to = Number(c.newCost);
        const pct = from ? (to - from) / from : null;
        return (
          <li
            key={c.id}
            className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-1.5"
          >
            <span className="text-muted-foreground tabular-nums">{fmtDate(c.at)}</span>
            <span className="min-w-0 truncate">
              {c.source === "receipt"
                ? t("parts.c.byReceipt", {
                    qty: qty(c.quantity ?? 0),
                    price: idr(Number(c.price ?? 0)),
                  })
                : `${t("parts.c.manual")} · ${c.reason}`}
              <span className="text-muted-foreground"> · {c.byName}</span>
            </span>
            <span className="text-right whitespace-nowrap tabular-nums">
              {from != null ? <span className="text-muted-foreground">{idr(from)} → </span> : null}
              <span className="font-medium">{idr(to)}</span>
              {pct != null && Math.abs(pct) >= 0.005 ? (
                <span
                  className="ml-1.5"
                  style={{ color: pct > 0 ? "var(--sys-red)" : "var(--sys-green)" }}
                >
                  {pct > 0 ? "+" : ""}
                  {(pct * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export { CostHistory, CostList };
