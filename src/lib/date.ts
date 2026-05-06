import { addDays, differenceInCalendarDays, format, isSameDay, parseISO, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";

export function isoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function displayDate(date: string | Date, pattern = "d MMM yyyy"): string {
  const value = typeof date === "string" ? parseISO(date) : date;
  return format(value, pattern, { locale: es });
}

export function calendarDaysForMonth(anchor: Date): Date[] {
  const first = startOfMonth(anchor);
  const mondayIndex = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -mondayIndex);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function dayDiff(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}
