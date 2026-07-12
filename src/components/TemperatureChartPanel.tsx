import { ChevronLeft, ChevronRight, Thermometer, ZoomIn, ZoomOut } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { displayDate } from "../lib/date";

export interface TemperatureChartDatum {
  date: string;
  label: string;
  tickLabel: string;
  temperature?: number;
  period: boolean;
  questionable: boolean;
}

interface TemperatureChartPanelProps {
  allChartDataLength: number;
  canMoveChartLeft: boolean;
  canMoveChartRight: boolean;
  chartData: TemperatureChartDatum[];
  chartDomain: [number, number] | ["auto", "auto"];
  chartWindow: number;
  selectedDate: string;
  onChartEndIndexChange: (updater: (current: number) => number) => void;
  onChartWindowChange: (updater: (current: number) => number) => void;
}

export default function TemperatureChartPanel({
  allChartDataLength,
  canMoveChartLeft,
  canMoveChartRight,
  chartData,
  chartDomain,
  chartWindow,
  selectedDate,
  onChartEndIndexChange,
  onChartWindowChange,
}: TemperatureChartPanelProps) {
  return (
    <Panel>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Thermometer className="h-5 w-5 text-coral" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold">Tus temperaturas recientes</h2>
            <p className="text-xs text-ink/50">
              {chartData.length ? `${displayDate(chartData[0].date, "d MMM")} - ${displayDate(chartData.at(-1)!.date, "d MMM")}` : "Sin datos"}
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
      <div className="h-72">
        {chartData.some((item) => item.temperature) ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 12, left: 0 }}>
              <CartesianGrid stroke="#2a3340" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#f7f2e8", opacity: 0.72 }} tickFormatter={(_, index) => chartData[index]?.tickLabel ?? ""} tickLine={false} axisLine={{ stroke: "#405063", opacity: 0.6 }} minTickGap={18} />
              <YAxis domain={chartDomain} tick={{ fontSize: 12, fill: "#f7f2e8", opacity: 0.72 }} tickLine={false} axisLine={{ stroke: "#405063", opacity: 0.6 }} unit=" C" width={54} />
              <Tooltip
                contentStyle={{ background: "#101722", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, color: "#f7f2e8" }}
                labelStyle={{ color: "#f7f2e8" }}
                itemStyle={{ color: "#f7f2e8" }}
                formatter={(value) => [`${Number(value).toFixed(2)} C`, "Temperatura"]}
                labelFormatter={(_, items) => displayDate(String(items?.[0]?.payload?.date ?? selectedDate))}
              />
              {chartData.map((item) =>
                item.period ? <ReferenceLine key={`period-${item.date}`} x={item.label} stroke="#d89b8b" strokeOpacity={0.22} strokeWidth={8} /> : null,
              )}
              <Line type="monotone" dataKey="temperature" stroke="#8fb9ad" strokeWidth={3} dot={{ r: 4, fill: "#8fb9ad" }} connectNulls />
              {chartData.map((item) =>
                item.questionable && item.temperature ? <ReferenceDot key={`q-${item.date}`} x={item.label} y={item.temperature} r={7} fill="#d7c783" stroke="#0d1117" /> : null,
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Registra tus temperaturas para verlas en un gráfico." />
        )}
      </div>
    </Panel>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section data-reveal className={`panel motion-reveal rounded border border-outline bg-surface p-4 shadow-soft sm:p-5 ${className}`}>{children}</section>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="grid h-full place-items-center rounded border border-dashed border-outline text-center text-sm text-ink/60">{text}</div>;
}
