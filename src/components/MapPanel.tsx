import { addDays } from "date-fns";
import { ChevronLeft, ChevronRight, HeartPulse } from "lucide-react";
import type { CycleWindow } from "../App";
import { displayDate, isoDate } from "../lib/date";
import {
  cervixFirmnessOptions,
  cervixHeightOptions,
  cervixOpennessOptions,
  mucusOptions,
  optionLabel,
} from "../lib/observations";
import { phaseMeta, type CyclePhase, type PhaseDay } from "../lib/phases";
import type { CycleEntry, CycleStats } from "../types";

interface MapPanelProps {
  activeCycleIndex: number;
  cycleWindows: CycleWindow[];
  activeCycle: CycleWindow | undefined;
  mapSelectedDay: CycleWindow["days"][number] | undefined;
  mapSelectedEntry: CycleEntry | undefined;
  onSelectDate: (date: string | null) => void;
  onMoveCycle: (direction: -1 | 1) => void;
  isWaitingForInitialSync: boolean;
  stats: CycleStats;
  entries: CycleEntry[];
}

export default function MapPanel({
  activeCycleIndex,
  cycleWindows,
  activeCycle,
  mapSelectedDay,
  mapSelectedEntry,
  onSelectDate,
  onMoveCycle,
  isWaitingForInitialSync,
  stats,
  entries,
}: MapPanelProps) {
  const canViewOlder = activeCycleIndex > 0;
  const canViewNewer = activeCycleIndex < cycleWindows.length - 1;
  const selectedMeta = mapSelectedDay ? phaseMeta[mapSelectedDay.phase] : phaseMeta.follicular;
  const cervixObservations = mapSelectedEntry
    ? [
        mapSelectedEntry.cervixHeight ? optionLabel(cervixHeightOptions, mapSelectedEntry.cervixHeight) : null,
        mapSelectedEntry.cervixFirmness ? optionLabel(cervixFirmnessOptions, mapSelectedEntry.cervixFirmness) : null,
        mapSelectedEntry.cervixOpenness ? optionLabel(cervixOpennessOptions, mapSelectedEntry.cervixOpenness) : null,
      ].filter((value): value is string => Boolean(value))
    : [];

  return (
    <div className="cycle-map-layout">
      <Panel className="cycle-map-panel">
        <header className="cycle-map-header">
          <button className="icon-button compact" type="button" onClick={() => onMoveCycle(-1)} disabled={!canViewOlder} aria-label="Ver ciclo anterior" title="Ciclo anterior">
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <div>
            <p>{activeCycle?.isCurrent ? "Ciclo actual" : "Ciclo anterior"}</p>
            <h2>{activeCycle ? `${displayDate(activeCycle.start, "d MMM")} - ${displayDate(activeCycle.end, "d MMM")}` : "Aún sin ciclo"}</h2>
          </div>
          <button className="icon-button compact" type="button" onClick={() => onMoveCycle(1)} disabled={!canViewNewer} aria-label="Ver ciclo siguiente" title="Ciclo siguiente">
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </header>

        {isWaitingForInitialSync ? (
          <EmptyState text="Sincronizando los datos recientes antes de dibujar el ciclo." />
        ) : activeCycle ? (
          <CycleWheel cycle={activeCycle} selectedDate={mapSelectedDay?.date} onSelectDate={onSelectDate} />
        ) : (
          <EmptyState text="Registra el inicio del periodo para dibujar tu mapa." />
        )}

        <div className="cycle-map-legend" aria-label="Leyenda de fases">
          {(["period", "follicular", "fertile", "possible-ovulation", "luteal"] as CyclePhase[]).map((phase) => (
            <span key={phase}>
              <i style={{ background: phaseMeta[phase].color }} />
              {phase === "possible-ovulation" ? "Ovulación posible" : phaseMeta[phase].label}
            </span>
          ))}
        </div>

        <p className="cycle-map-safety">
          Los días con espermatozoides representan mayor riesgo de embarazo al tener relaciones sin protección.
        </p>
      </Panel>

      <Panel className="cycle-map-detail">
        <div className="mb-4 flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-moss" aria-hidden="true" />
          <h2 className="text-lg font-semibold">{mapSelectedDay ? "Lectura del día" : "Resumen del ciclo"}</h2>
        </div>
        <div className="cycle-day-focus" style={{ borderColor: selectedMeta.color, background: selectedMeta.soft }}>
          <span>{mapSelectedDay ? `Día ${mapSelectedDay.cycleDay}` : "Duración registrada"}</span>
          <strong>{mapSelectedDay ? displayDate(mapSelectedDay.date, "EEEE, d 'de' MMMM") : `${activeCycle?.days.length ?? 0} días`}</strong>
          <p>{mapSelectedDay?.description ?? "Selecciona un punto del círculo para revisar la lectura de ese día."}</p>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          {mapSelectedDay ? <Stat label="Fase estimada" value={mapSelectedDay.label} /> : null}
          {mapSelectedDay ? <Stat label="Confianza" value={mapSelectedDay.confidence} /> : null}
          {mapSelectedDay ? <Stat label="Día del ciclo" value={String(mapSelectedDay.cycleDay)} /> : null}
          <Stat label="Promedio ciclo" value={stats.averageCycleLength ? `${stats.averageCycleLength} días` : "Pendiente"} />
          {mapSelectedEntry?.cervicalMucus ? <Stat label="Flujo cervical" value={optionLabel(mucusOptions, mapSelectedEntry.cervicalMucus)} /> : null}
          {cervixObservations.length > 0 ? <Stat label="Cuello uterino" value={cervixObservations.join(" / ")} /> : null}
        </dl>
        <div className="info-box warning mt-3">
          Próximo periodo estimado:{" "}
          <strong>{stats.predictedNextPeriod ? displayDate(stats.predictedNextPeriod) : "requiere más ciclos"}</strong>. Es una predicción simple.
        </div>
        <div className="info-box mt-3">
          {entries.filter((entry) => entry.temperatureReadings.length > 0).length >= 20
            ? "Ya hay suficientes tomas para empezar a mirar tendencia térmica."
            : "Con más temperaturas diarias, Alba podrá explicar mejor los cambios de fase."}
        </div>
      </Panel>
    </div>
  );
}

function CycleWheel({
  cycle,
  selectedDate,
  onSelectDate,
}: {
  cycle: CycleWindow;
  selectedDate?: string;
  onSelectDate: (date: string) => void;
}) {
  const size = 360;
  const center = size / 2;
  const dayRadius = 147;
  const selected = selectedDate ? cycle.days.find((day) => day.date === selectedDate) : undefined;
  const selectedDisplayDate = selected ? displayWheelDate(selected.date) : undefined;

  return (
    <div className="cycle-wheel-shell">
      <svg className="cycle-wheel" viewBox={`0 0 ${size} ${size}`} role="group" aria-label={`Ciclo de ${cycle.days.length} días`}>
        <defs>
          <filter id="cycle-day-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="sperm-head-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fff8ed" />
            <stop offset="52%" stopColor="#d8d0c3" />
            <stop offset="100%" stopColor="#958f86" />
          </linearGradient>
          <linearGradient id="sperm-tail-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#c9c0b2" />
            <stop offset="100%" stopColor="#8f8a82" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <circle className="cycle-wheel-inner" cx={center} cy={center} r={107} />
        {cycle.days.map((day, index) => {
          const angle = -90 + (index / cycle.days.length) * 360;
          const radians = (angle * Math.PI) / 180;
          const x = center + Math.cos(radians) * dayRadius;
          const y = center + Math.sin(radians) * dayRadius;
          const cueRadius = dayRadius - 20;
          const cueX = center + Math.cos(radians) * cueRadius;
          const cueY = center + Math.sin(radians) * cueRadius;
          const meta = phaseMeta[day.phase];
          const isSelected = day.date === selected?.date;
          const showFertilityCue = day.phase === "fertile" || day.phase === "possible-ovulation";

          return (
            <g
              className={`cycle-wheel-day${day.isFuture ? " is-future" : ""}${day.isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}`}
              key={day.date}
              role="button"
              tabIndex={0}
              aria-label={`Día ${day.cycleDay}, ${day.label}${day.isToday ? ", hoy" : ""}`}
              onClick={() => onSelectDate(day.date)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelectDate(day.date);
              }}
            >
              <circle className="cycle-day-hit" cx={x} cy={y} r={17} />
              {isSelected ? <circle className="cycle-day-selection" cx={x} cy={y} r={17} style={{ stroke: meta.color }} /> : null}
              <circle className="cycle-day-dot" cx={x} cy={y} r={day.isToday ? 14 : 12.5} style={{ fill: meta.color }} />
              {showFertilityCue ? <SpermCue x={cueX} y={cueY} rotation={angle + 180} /> : null}
              <text className="cycle-day-number" x={x} y={y + 0.5} fontWeight={900}>
                {day.cycleDay}
              </text>
            </g>
          );
        })}
        <text className="cycle-wheel-eyebrow" x={center} y={149}>{selected ? "DÍA DEL CICLO" : "DURACIÓN DEL CICLO"}</text>
        <text className="cycle-wheel-value" x={center} y={193}>{selected?.cycleDay ?? cycle.days.length}</text>
        <text className="cycle-wheel-phase" x={center} y={219}>{selected?.label ?? "días"}</text>
        {selectedDisplayDate ? <text className="cycle-wheel-date" x={center} y={238}>{selectedDisplayDate}</text> : null}
        {selected?.isToday ? <text className="cycle-wheel-today" x={center} y={256}>HOY</text> : null}
      </svg>
    </div>
  );
}

function displayWheelDate(date: string): string {
  const today = new Date();
  if (date === isoDate(addDays(today, -1))) return "Ayer";
  if (date === isoDate(addDays(today, 1))) return "Mañana";
  const [day, month] = displayDate(date, "d|MMMM").split("|");
  return `${day} de ${month.charAt(0).toUpperCase()}${month.slice(1)}`;
}

function SpermCue({ x, y, rotation }: { x: number; y: number; rotation: number }) {
  return (
    <g className="fertility-cue" transform={`translate(${x} ${y}) rotate(${rotation})`} aria-hidden="true">
      <path className="fertility-cue-head" d="M -4.8 -1.2 C -4.5 -5.4 0.6 -7.3 4.2 -4.4 C 6.7 -2.3 6.5 1.8 3.7 3.8 C 0.1 6.3 -4.5 3.2 -4.8 -1.2 Z" />
      <path className="fertility-cue-cap" d="M -4.5 -1.5 C -3.8 -4.6 -0.7 -5.9 1.8 -5 C -0.4 -1.8 -0.5 1.2 -2.4 3 C -4 1.9 -4.8 0.2 -4.5 -1.5 Z" />
      <path className="fertility-cue-midpiece" d="M 4.4 -0.2 C 7 -0.6 8.9 0.1 10.7 1.1" />
      <path className="fertility-cue-tail" d="M 10.2 1 C 15.2 4.7 15.8 -4.8 20.8 -2.6 C 25.2 -0.7 21.4 6.1 26.3 6.6 C 30.4 7 30.8 1.9 34.7 2.7" />
    </g>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section data-reveal className={`panel motion-reveal rounded border border-outline bg-surface p-4 shadow-soft sm:p-5 ${className}`}>{children}</section>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="grid h-full place-items-center rounded border border-dashed border-outline text-center text-sm text-ink/60">{text}</div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-outline bg-surface/70 p-3">
      <dt className="text-xs font-medium uppercase tracking-[0.12em] text-ink/58">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}
