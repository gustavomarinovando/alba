import { ChevronLeft, ChevronRight, Thermometer, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { displayDate } from "../lib/date";
import { phaseMeta, type CyclePhase } from "../lib/phases";

export interface TemperatureChartDatum {
  date: string;
  label: string;
  tickLabel: string;
  temperature?: number;
  period: boolean;
  questionable: boolean;
  phase?: CyclePhase;
  cycleDay?: number;
}

export interface ChartCoverline {
  value: number;
  startDate: string;
}

interface TemperatureChartPanelProps {
  allChartDataLength: number;
  canMoveChartLeft: boolean;
  canMoveChartRight: boolean;
  chartData: TemperatureChartDatum[];
  chartDomain: [number, number] | ["auto", "auto"];
  chartWindow: number;
  coverline: ChartCoverline | null;
  selectedDate: string;
  onChartEndIndexChange: (updater: (current: number) => number) => void;
  onChartWindowChange: (updater: (current: number) => number) => void;
}

/** Contiguous runs of the same phase, so each run renders as one band. */
function phaseRuns(data: TemperatureChartDatum[]): Array<{ phase: CyclePhase; from: string; to: string }> {
  const runs: Array<{ phase: CyclePhase; from: string; to: string }> = [];
  for (const item of data) {
    if (!item.phase) continue;
    const last = runs[runs.length - 1];
    if (last && last.phase === item.phase) {
      last.to = item.label;
    } else {
      runs.push({ phase: item.phase, from: item.label, to: item.label });
    }
  }
  return runs;
}

function TemperatureDot(props: any) {
  const { cx, cy, payload } = props;
  if (typeof cx !== "number" || typeof cy !== "number" || typeof payload?.temperature !== "number") return null;
  if (payload.questionable) {
    // Hollow ring: a reading taken without resting conditions.
    return <circle cx={cx} cy={cy} r={4.5} fill="var(--color-surface)" stroke="var(--color-marigold)" strokeWidth={2} />;
  }
  return <circle cx={cx} cy={cy} r={3.5} fill="var(--color-moss)" stroke="var(--color-background)" strokeWidth={1} />;
}

export default function TemperatureChartPanel({
  allChartDataLength,
  canMoveChartLeft,
  canMoveChartRight,
  chartData,
  chartDomain,
  chartWindow,
  coverline,
  selectedDate,
  onChartEndIndexChange,
  onChartWindowChange,
}: TemperatureChartPanelProps) {
  const dragState = useRef<{ pointerId: number; lastX: number; carry: number } | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  const domainMin = typeof chartDomain[0] === "number" ? chartDomain[0] : 36;
  const domainMax = typeof chartDomain[1] === "number" ? chartDomain[1] : 37;
  const bands = phaseRuns(chartData);
  const periodDays = chartData.filter((item) => item.period);
  const coverlineVisible = coverline !== null && coverline.value > domainMin && coverline.value < domainMax;
  const coverlineStartLabel = coverline
    ? (chartData.find((item) => item.date >= coverline.startDate)?.label ?? null)
    : null;

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (chartData.length === 0) return;
    dragState.current = { pointerId: event.pointerId, lastX: event.clientX, carry: 0 };
    plotRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = plotRef.current?.clientWidth ?? 0;
    if (width === 0) return;
    const pxPerDay = width / chartWindow;
    drag.carry += drag.lastX - event.clientX;
    drag.lastX = event.clientX;
    const days = Math.trunc(drag.carry / pxPerDay);
    if (days !== 0) {
      drag.carry -= days * pxPerDay;
      onChartEndIndexChange((current) => Math.min(allChartDataLength - 1, Math.max(chartWindow - 1, current + days)));
    }
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (dragState.current?.pointerId === event.pointerId) dragState.current = null;
  }

  return (
    <Panel>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Thermometer className="h-5 w-5 text-coral" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold">Tus temperaturas recientes</h2>
            <p className="text-xs text-ink/50">
              {chartData.length ? `${displayDate(chartData[0].date, "d MMM")} - ${displayDate(chartData.at(-1)!.date, "d MMM")} · arrastra para moverte` : "Sin datos"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="icon-button compact" title="Ver días anteriores" type="button" disabled={!canMoveChartLeft} onClick={() => onChartEndIndexChange((current) => Math.max(chartWindow - 1, current - chartWindow))}>
            <ChevronLeft aria-hidden="true" size={17} />
          </button>
          <button className="icon-button compact" title="Alejar" type="button" disabled={chartWindow >= 60} onClick={() => onChartWindowChange((current) => Math.min(60, current + 7))}>
            <ZoomOut aria-hidden="true" size={17} />
          </button>
          <button className="icon-button compact" title="Acercar" type="button" disabled={chartWindow <= 7} onClick={() => onChartWindowChange((current) => Math.max(7, current - 7))}>
            <ZoomIn aria-hidden="true" size={17} />
          </button>
          <button className="icon-button compact" title="Ver días siguientes" type="button" disabled={!canMoveChartRight} onClick={() => onChartEndIndexChange((current) => Math.min(allChartDataLength - 1, current + chartWindow))}>
            <ChevronRight aria-hidden="true" size={17} />
          </button>
        </div>
      </div>
      <div
        ref={plotRef}
        className="temperature-plot h-72"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        {chartData.some((item) => item.temperature) ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 12, right: 16, bottom: 16, left: 0 }}>
              <defs>
                <linearGradient id="temperature-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-moss)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--color-moss)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              {/* Phase bands share the cycle-map palette so both tabs read alike. */}
              {bands.map((band, index) => (
                <ReferenceArea
                  key={`band-${index}`}
                  x1={band.from}
                  x2={band.to}
                  y1={domainMin}
                  y2={domainMax}
                  fill={phaseMeta[band.phase].soft}
                  stroke="none"
                />
              ))}
              <CartesianGrid stroke="var(--color-outline)" strokeOpacity={0.5} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--color-ink)", opacity: 0.62 }}
                tickFormatter={(_, index) => chartData[index]?.tickLabel ?? ""}
                tickLine={false}
                axisLine={{ stroke: "var(--color-outline)" }}
                minTickGap={12}
                interval={0}
              />
              <YAxis
                domain={chartDomain}
                tick={{ fontSize: 11, fill: "var(--color-ink)", opacity: 0.62 }}
                tickLine={false}
                axisLine={{ stroke: "var(--color-outline)" }}
                unit="°"
                width={44}
              />
              <Tooltip
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-outline)", borderRadius: 12, color: "var(--color-ink)", backdropFilter: "blur(14px)" }}
                labelStyle={{ color: "var(--color-ink)", fontWeight: 600 }}
                itemStyle={{ color: "var(--color-ink)" }}
                formatter={(value) => [`${Number(value).toFixed(2)} °C`, "Temperatura"]}
                labelFormatter={(_, items) => {
                  const payload = items?.[0]?.payload as TemperatureChartDatum | undefined;
                  const base = displayDate(String(payload?.date ?? selectedDate));
                  const phaseLabel = payload?.phase ? ` · ${phaseMeta[payload.phase].label}` : "";
                  const cycleDay = payload?.cycleDay ? ` · CD ${payload.cycleDay}` : "";
                  return `${base}${cycleDay}${phaseLabel}`;
                }}
              />
              {coverlineVisible && coverline ? (
                <>
                  <ReferenceLine
                    y={coverline.value}
                    stroke="var(--color-marigold)"
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    label={{ value: "Línea base", position: "insideTopRight", fill: "var(--color-marigold)", fontSize: 10, fontWeight: 700 }}
                  />
                  {coverlineStartLabel ? (
                    <ReferenceArea
                      x1={coverlineStartLabel}
                      x2={chartData.at(-1)!.label}
                      y1={coverline.value}
                      y2={domainMax}
                      fill="var(--color-moss)"
                      fillOpacity={0.07}
                      stroke="none"
                    />
                  ) : null}
                </>
              ) : null}
              <Area
                type="monotone"
                dataKey="temperature"
                stroke="var(--color-moss)"
                strokeWidth={2.5}
                fill="url(#temperature-fill)"
                dot={<TemperatureDot />}
                activeDot={{ r: 6, fill: "var(--color-moss)", stroke: "var(--color-background)", strokeWidth: 2 }}
                connectNulls
              />
              {/* Period days: droplets in a slim bottom lane instead of full-height columns. */}
              {periodDays.map((item) => (
                <ReferenceLine
                  key={`period-${item.date}`}
                  x={item.label}
                  stroke="none"
                  label={{ value: "💧", position: "insideBottom", fontSize: 12, dy: 8 }}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Registra tus temperaturas para verlas en un gráfico." />
        )}
      </div>
      {coverlineVisible ? (
        <p className="mt-2 text-xs text-ink/55">
          La línea base marca la temperatura más alta de los 6 días previos al cambio térmico: tres días seguidos por encima sugieren ovulación.
        </p>
      ) : null}
    </Panel>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLElement | null>(null);
  // This mounts after the app's own IntersectionObserver scan already ran (it's lazy-loaded
  // behind Suspense), so it would otherwise never get ".is-revealed" and stay invisible.
  useEffect(() => {
    ref.current?.classList.add("is-revealed");
  }, []);
  return <section ref={ref} data-reveal className={`panel motion-reveal rounded border border-outline bg-surface p-4 shadow-soft sm:p-5 ${className}`}>{children}</section>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="grid h-full place-items-center rounded border border-dashed border-outline text-center text-sm text-ink/60">{text}</div>;
}
