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

const ISO_DATE_PATTERN = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

/**
 * The AI is instructed to always write dates as ISO (AAAA-MM-DD) in its prose so
 * it stays consistent across weaker models; this turns them into "26 de septiembre"
 * for display, so formatting never depends on the model actually following style rules.
 */
export function humanizeIsoDatesInText(text: string, todayIso = isoDate(new Date())): string {
  const currentYear = todayIso.slice(0, 4);
  return text.replace(ISO_DATE_PATTERN, (match, year: string, month: string, day: string) => {
    const parsed = parseISO(match);
    if (Number.isNaN(parsed.getTime())) return match;
    return format(parsed, year === currentYear ? "d 'de' MMMM" : "d 'de' MMMM 'de' yyyy", { locale: es });
  });
}
