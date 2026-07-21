import { addMonths, format, isSameMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { calendarDaysForMonth, displayDate, isToday, isoDate } from "../lib/date";
import { getPrimaryTemperature } from "../lib/temperature";
import type { PhaseDay } from "../lib/phases";
import type { CycleEntry } from "../types";

const weekdayLabels = ["L", "M", "M", "J", "V", "S", "D"];

interface CalendarPanelProps {
  visibleMonth: Date;
  onVisibleMonthChange: (month: Date) => void;
  entryByDate: Map<string, CycleEntry>;
  phaseByDate: Map<string, PhaseDay>;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  isMonthlyAnniversary: boolean;
}

export default function CalendarPanel({
  visibleMonth,
  onVisibleMonthChange,
  entryByDate,
  phaseByDate,
  selectedDate,
  onSelectDate,
  isMonthlyAnniversary,
}: CalendarPanelProps) {
  return (
    <Panel>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-moss" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Calendario</h2>
        </div>
        <div className="flex items-center gap-2">
          <button className="icon-button compact" title="Mes anterior" onClick={() => onVisibleMonthChange(subMonths(visibleMonth, 1))} type="button">
            <ChevronLeft aria-hidden="true" size={17} />
          </button>
          <span className="min-w-36 text-center text-sm font-medium capitalize text-ink">
            {format(visibleMonth, "MMMM yyyy", { locale: es })}
          </span>
          <button className="icon-button compact" title="Mes siguiente" onClick={() => onVisibleMonthChange(addMonths(visibleMonth, 1))} type="button">
            <ChevronRight aria-hidden="true" size={17} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-ink/60">
        {weekdayLabels.map((label, index) => (
          <span key={`${label}-${index}`} className="py-1">
            {label}
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {calendarDaysForMonth(visibleMonth).map((day) => {
          const date = isoDate(day);
          const entry = entryByDate.get(date);
          const selected = selectedDate === date;
          const phase = phaseByDate.get(date);
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDate(date)}
              className={[
                "calendar-day",
                selected ? "selected" : "",
                entry?.isPeriod ? `flow-${entry.flow}` : "",
                phase ? `phase-${phase.phase}` : "",
                !isSameMonth(day, visibleMonth) ? "outside" : "",
                isToday(day) ? "today" : "",
                isMonthlyAnniversary && format(day, "d") === "6" ? "anniversary-six" : "",
              ].join(" ")}
              title={phase ? `${displayDate(date)} - ${phase.label}` : displayDate(date)}
            >
              <span>{format(day, "d")}</span>
              {getPrimaryTemperature(entry) ? <small>{getPrimaryTemperature(entry)!.value.toFixed(2)} C</small> : <small>&nbsp;</small>}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section data-reveal className={`panel motion-reveal rounded border border-outline bg-surface p-4 shadow-soft sm:p-5 ${className}`}>{children}</section>;
}
