import { addDays, addMonths, differenceInCalendarDays, format, isSameMonth, parseISO, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import Tippy from "@tippyjs/react";
import "tippy.js/dist/tippy.css";
import "tippy.js/animations/shift-away-subtle.css";
import {
  CalendarDays,
  Bell,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  Download,
  Eraser,
  FileUp,
  HeartPulse,
  Info,
  Loader2,
  Minus,
  Moon,
  Plus,
  Sparkles,
  Sun,
  Thermometer,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
import { requestCycleInsight } from "./lib/ai";
import { calculateStats, getRecentEntries } from "./lib/cycles";
import { calendarDaysForMonth, displayDate, isToday, isoDate } from "./lib/date";
import {
  cervixFirmnessOptions,
  cervixHeightOptions,
  cervixOpennessOptions,
  mucusOptions,
  optionLabel,
} from "./lib/observations";
import { buildPhaseMap, phaseMeta, type CyclePhase, type PhaseDay } from "./lib/phases";
import { buildExport, clearEntries, deleteEntry, getAllEntries, parseImport, replaceEntries, saveEntry } from "./lib/storage";
import { deleteAllSupabaseEntries, deleteSupabaseEntry, isDemoEntry, isSupabaseConfigured, previewSyncWithSupabase, savePushSubscription, syncWithSupabase, testSupabaseConnection, upsertSupabaseEntry, type SupabaseSyncPreview } from "./lib/supabaseSync";
import { createTemperatureReading, getOralTemperature, getPrimaryTemperature, hasMeaningfulEntry, normalizeTemperatureReadings } from "./lib/temperature";
import type {
  CervicalMucus,
  CervixFirmness,
  CervixHeight,
  CervixOpenness,
  CycleEntry,
  FlowLevel,
  TemperatureReading,
  TemperatureSite,
} from "./types";

const flowOptions: Array<{ value: FlowLevel; label: string }> = [
  { value: "none", label: "Ninguno" },
  { value: "light", label: "Leve" },
  { value: "medium", label: "Medio" },
  { value: "heavy", label: "Fuerte" },
];

const weekdayLabels = ["L", "M", "M", "J", "V", "S", "D"];
const temperatureSiteOptions: Array<{ value: TemperatureSite; label: string }> = [
  { value: "oral", label: "Bucal" },
  { value: "axillary", label: "Axilar" },
  { value: "vaginal", label: "Vaginal" },
];
const tabs = [
  { id: "today", label: "Hoy", icon: ClipboardList },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "chart", label: "Temperatura", icon: Thermometer },
  { id: "map", label: "Mapa", icon: HeartPulse },
  { id: "ai", label: "IA", icon: Sparkles },
  { id: "settings", label: "Ajustes", icon: Database },
] as const;
type AppTab = (typeof tabs)[number]["id"];
type BrowserNotificationPermission = NotificationPermission | "unsupported";
type TemperatureFlyer = {
  id: number;
  value: number;
  site: string;
  fromX: number;
  fromY: number;
  deltaX: number;
  deltaY: number;
};
type AnniversarySparkle = {
  id: number;
  x: number;
  y: number;
};

const THEME_STORAGE_KEY = "alba-theme";
const TEMPERATURE_REMINDERS_KEY = "alba-temperature-reminders";
const TEMPERATURE_REMINDER_LAST_SHOWN_KEY = "alba-temperature-reminder-last-shown";
const MONTHLY_ANNIVERSARY_TITLE = "Buenos dias bonita, feliz mesario 🥰💕✨";
const MORNING_GREETINGS = ["Buenos días", "Muyyy buenos días", "Muy buenos días", "Muy pero muy buenos días"] as const;
const MORNING_ENDEARMENTS = [
  "mi amor",
  "bonita",
  "mi amorcito",
  "mi amorcito de mi corazón",
  "amor mío",
  "mi niña preciosa",
  "chiquita",
  "mi cielito",
  "mi cielito lindo",
] as const;
const MORNING_FACE_EMOJIS = ["🥰", "😚", "🤗", "☺️"] as const;
const MORNING_HEART_EMOJIS = ["❤️", "💗", "💖", "💓", "💘", "💝", "💞", "💕", "❤️‍🔥", "❤️‍🩹"] as const;
const TEMPERATURE_REMINDER_BODIES = [
  "Cuando puedas, anota tu temperatura amor mío.",
  "Toma una muestra pequeñita y sigue cuidando tu mapa.",
  "Si ya te levantaste estamos listos para tomar tu temperatura.",
] as const;
const TEMPERATURE_REMINDER_SLOTS = [
  { id: "morning", startHour: 6, endHour: 11 },
  { id: "midday", startHour: 12, endHour: 15 },
  { id: "afternoon", startHour: 16, endHour: 20 },
] as const;

function emptyEntry(date: string): CycleEntry {
  const now = new Date().toISOString();
  return {
    date,
    isPeriod: false,
    flow: "none",
    temperatureReadings: [],
    questionableTemp: false,
    note: "",
    createdAt: now,
    updatedAt: now,
  };
}

export default function App() {
  const [entries, setEntries] = useState<CycleEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(isoDate(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(new Date());
  const [draft, setDraft] = useState<CycleEntry>(() => emptyEntry(selectedDate));
  const [status, setStatus] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveFeedback, setSaveFeedback] = useState<"idle" | "saving" | "saved">("idle");
  const [insight, setInsight] = useState("");
  const [isInsightLoading, setIsInsightLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPreparingSyncPreview, setIsPreparingSyncPreview] = useState(false);
  const [syncPreview, setSyncPreview] = useState<SupabaseSyncPreview | null>(null);
  const [isTestingCloud, setIsTestingCloud] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [pendingTemperature, setPendingTemperature] = useState(36.9);
  const [pendingTemperatureInput, setPendingTemperatureInput] = useState("36.9");
  const [pendingTemperatureSite, setPendingTemperatureSite] = useState<TemperatureSite>("oral");
  const [prioritizedEntryDate, setPrioritizedEntryDate] = useState<string | null>(null);
  const [lastTemperatureActionAt, setLastTemperatureActionAt] = useState(0);
  const [showDeleteDayConfirm, setShowDeleteDayConfirm] = useState(false);
  const [focusedSegmentId, setFocusedSegmentId] = useState<string | null>(null);
  const [mapTooltip, setMapTooltip] = useState<{ segmentId: string; anchorDate: string; pinned: boolean } | null>(null);
  const [isMobileMap, setIsMobileMap] = useState(false);
  const [chartWindow, setChartWindow] = useState(14);
  const [chartEndIndex, setChartEndIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<AppTab>("today");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isNavCompact, setIsNavCompact] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const storedTheme = safeLocalGet(THEME_STORAGE_KEY);
      if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
      return "dark";
    }
    return "dark";
  });
  const [notificationPermission, setNotificationPermission] = useState<BrowserNotificationPermission>(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  });
  const [temperatureRemindersEnabled, setTemperatureRemindersEnabled] = useState(() => safeLocalGet(TEMPERATURE_REMINDERS_KEY) === "true");
  const [temperatureFlyer, setTemperatureFlyer] = useState<TemperatureFlyer | null>(null);
  const showBrandLab = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("brand-lab");
  const isMonthlyAnniversary = new Date().getDate() === 6;
  const [showAnniversaryIntro, setShowAnniversaryIntro] = useState(() => {
    const today = isoDate(new Date());
    return today === "2026-06-06" && safeSessionGet(`alba-anniversary-${today}`) !== "seen";
  });
  const [showAnniversaryNote, setShowAnniversaryNote] = useState(false);
  const [anniversaryTapCount, setAnniversaryTapCount] = useState(0);
  const [anniversarySparkles, setAnniversarySparkles] = useState<AnniversarySparkle[]>([]);
  const importInput = useRef<HTMLInputElement>(null);
  const temperatureDisplayRef = useRef<HTMLLabelElement>(null);
  const savedTemperaturesRef = useRef<HTMLDivElement>(null);
  const lastCloudSyncAt = useRef(0);
  const anniversaryLongPressTimer = useRef<number | null>(null);
  const lastSparkleAt = useRef(0);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    safeLocalSet(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = (event: React.MouseEvent) => {
    const isDark = theme === "dark";
    const nextTheme = isDark ? "light" : "dark";

    if (!document.startViewTransition) {
      setTheme(nextTheme);
      return;
    }

    const x = event.clientX;
    const y = event.clientY;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(() => {
      flushSync(() => {
        setTheme(nextTheme);
      });
      if (nextTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    });

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ];

      document.documentElement.animate(
        {
          clipPath: isDark ? [...clipPath].reverse() : clipPath,
        },
        {
          duration: 600,
          easing: "ease-in-out",
          pseudoElement: isDark ? "::view-transition-old(root)" : "::view-transition-new(root)",
        }
      );
    });
  };


  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const storedEntries = await getAllEntries();
        if (safeLocalGet("alba-demo-mode") === "true") {
          const demoEntries = await loadMappedDemoEntries();
          setEntries(demoEntries);
          setPrioritizedEntryDate(shouldPrioritizeDate(selectedDate, demoEntries) ? selectedDate : null);
          setIsDemoMode(true);
          setStatus("Modo demo activo. Estos datos no se sincronizan.");
          return;
        }

        const realEntries = storedEntries.filter((entry) => !isDemoEntry(entry));
        if (realEntries.length !== storedEntries.length) {
          await replaceEntries(realEntries);
          safeLocalSet("alba-demo-mode", "false");
        }

        setEntries(realEntries);
        setPrioritizedEntryDate(shouldPrioritizeDate(selectedDate, realEntries) ? selectedDate : null);

        if (isSupabaseConfigured()) {
          void syncCloudData({ quiet: true, entriesOverride: realEntries });
        }
      } catch {
        setStatus("No se pudo abrir la base local.");
      }
    }

    loadInitialData();
  }, []);

  useEffect(() => {
    const onScroll = () => setIsNavCompact(window.scrollY > 96);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobileMap(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (isDemoMode || !isSupabaseConfigured()) return;

    const syncIfActive = () => {
      if (document.visibilityState === "hidden" || isSyncing) return;
      if (Date.now() - lastCloudSyncAt.current < 30000) return;
      void syncCloudData({ quiet: true });
    };

    window.addEventListener("focus", syncIfActive);
    window.addEventListener("online", syncIfActive);
    document.addEventListener("visibilitychange", syncIfActive);

    return () => {
      window.removeEventListener("focus", syncIfActive);
      window.removeEventListener("online", syncIfActive);
      document.removeEventListener("visibilitychange", syncIfActive);
    };
  }, [isDemoMode, isSyncing]);

  const entryByDate = useMemo(() => new Map(entries.map((entry) => [entry.date, entry])), [entries]);
  const stats = useMemo(() => calculateStats(entries), [entries]);
  const recentEntries = useMemo(() => getRecentEntries(entries, 92), [entries]);
  const phaseByDate = useMemo(() => buildPhaseMap(entries), [entries]);
  const selectedPhase = phaseByDate.get(selectedDate);
  const estimatedNextPeriod = useMemo(() => {
    if (stats.predictedNextPeriod) return stats.predictedNextPeriod;
    if (!stats.lastPeriodStart) return undefined;
    return isoDate(addDays(parseISO(stats.lastPeriodStart), Math.round(stats.averageCycleLength ?? 30)));
  }, [stats.averageCycleLength, stats.lastPeriodStart, stats.predictedNextPeriod]);
  const visiblePhaseDays = useMemo(() => getRecentEntries(entries, 60).map((entry) => phaseByDate.get(entry.date)).filter(Boolean), [entries, phaseByDate]);
  const phaseSegments = useMemo(() => buildPhaseSegments(visiblePhaseDays, entries), [visiblePhaseDays, entries]);
  const hasTemperatureToday = draft.temperatureReadings.length > 0;
  const shouldPrioritizeEntry = prioritizedEntryDate === selectedDate;
  const periodNeedsAttention = useMemo(() => shouldSurfacePeriod(entries, selectedDate, draft), [entries, selectedDate, draft]);
  const parsedPendingTemperature = parseTemperatureInput(pendingTemperatureInput);
  const registerTemperatureBlocked =
    parsedPendingTemperature === undefined ||
    Date.now() - lastTemperatureActionAt < 6000 ||
    hasSameMinuteTemperature(draft, parsedPendingTemperature, pendingTemperatureSite);
  const selectedSegment = phaseSegments.find((segment) => selectedDate >= segment.start && selectedDate <= segment.end);
  const activeMapSegment = phaseSegments.find((segment) => segment.id === focusedSegmentId) ?? selectedSegment ?? phaseSegments[0];
  const activeMapPhase: CyclePhase = activeMapSegment?.phase ?? "follicular";
  const activeMapMeta = phaseMeta[activeMapPhase];

  useEffect(() => {
    if (!status) return;
    const timeout = window.setTimeout(() => setStatus(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [status]);

  useEffect(() => {
    if (saveState === "saving") {
      setSaveFeedback("saving");
      return;
    }

    if (saveState === "saved") {
      setSaveFeedback("saved");
      const timeout = window.setTimeout(() => setSaveFeedback("idle"), 1600);
      return () => window.clearTimeout(timeout);
    }
  }, [saveState]);

  useEffect(() => {
    safeLocalSet(TEMPERATURE_REMINDERS_KEY, String(temperatureRemindersEnabled));
  }, [temperatureRemindersEnabled]);

  useEffect(() => {
    if (!temperatureRemindersEnabled || notificationPermission !== "granted" || isDemoMode) return;
    if (selectedDate !== isoDate(new Date()) || hasTemperatureToday) return;

    const now = new Date();
    const currentSlot = temperatureReminderSlot(now);
    if (!currentSlot) return;
    const reminderKey = `${isoDate(now)}:${currentSlot.id}`;
    if (safeLocalGet(TEMPERATURE_REMINDER_LAST_SHOWN_KEY) === reminderKey) return;

    const timeout = window.setTimeout(() => {
      const copy = temperatureReminderCopy();
      void showTemperatureReminder({
        title: copy.title,
        body: copy.body,
        markAsShown: true,
        reminderKey,
      });
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [temperatureRemindersEnabled, notificationPermission, hasTemperatureToday, selectedDate, isDemoMode]);

  useEffect(() => {
    setChartEndIndex(Math.max(0, recentEntries.length - 1));
  }, [recentEntries.length]);

  useEffect(() => {
    const nextDraft = entryByDate.get(selectedDate) ?? emptyEntry(selectedDate);
    setDraft(nextDraft);
    setShowAdvanced(Boolean(nextDraft.cervicalMucus || nextDraft.cervixHeight || nextDraft.cervixFirmness || nextDraft.cervixOpenness));
  }, [entryByDate, selectedDate]);

  useEffect(() => {
    if (draft.temperatureReadings.length > 0) return;
    const latest = getLatestTemperatureBefore(entries, selectedDate);
    const nextValue = latest?.value ?? 36.9;
    const nextSite = latest?.site ?? "oral";
    setPendingTemperature(nextValue);
    setPendingTemperatureInput(formatPendingTemperature(nextValue));
    setPendingTemperatureSite(nextSite);
  }, [draft.date, draft.temperatureReadings.length, entries, selectedDate]);

  useEffect(() => {
    setPrioritizedEntryDate(shouldPrioritizeDate(selectedDate, entries) ? selectedDate : null);
  }, [selectedDate]);

  useEffect(() => {
    if (!mapTooltip?.pinned) return;

    const onPointerDown = (event: PointerEvent) => {
      if (mapRef.current?.contains(event.target as Node)) return;
      setMapTooltip(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [mapTooltip?.pinned]);

  useEffect(() => {
    const existing = entryByDate.get(draft.date);
    const shouldSave = hasMeaningfulEntry(draft);
    const comparableDraft = JSON.stringify({ ...draft, updatedAt: "" });
    const comparableExisting = existing ? JSON.stringify({ ...existing, updatedAt: "" }) : "";

    if (!shouldSave || comparableDraft === comparableExisting) {
      setSaveState("idle");
      return;
    }

    setSaveState("saving");
    const timeout = window.setTimeout(() => {
      persistDraft({ quiet: true });
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [draft]);

  const allChartData = recentEntries.map((entry, index) => ({
    day: index + 1,
    date: entry.date,
    label: displayDate(entry.date, "d MMM"),
    tickLabel: index % 7 === 0 ? displayDate(entry.date, "d MMM") : "",
    temperature: getOralTemperature(entry)?.value,
    period: entry.isPeriod ? 1 : 0,
    questionable: getOralTemperature(entry)?.isResting === false,
  }));
  const chartStartIndex = Math.max(0, chartEndIndex - chartWindow + 1);
  const chartData = allChartData.slice(chartStartIndex, chartEndIndex + 1);
  const chartTemperatures = chartData
    .map((item) => item.temperature)
    .filter((temperature): temperature is number => typeof temperature === "number");
  const chartDomain =
    chartTemperatures.length > 0
      ? [
          Math.floor((Math.min(...chartTemperatures) - 0.15) * 10) / 10,
          Math.ceil((Math.max(...chartTemperatures) + 0.15) * 10) / 10,
        ]
      : [36, 37];
  const canMoveChartLeft = chartStartIndex > 0;
  const canMoveChartRight = chartEndIndex < allChartData.length - 1;

  async function persistDraft(options?: { quiet?: boolean }) {
    const primaryTemperature = getPrimaryTemperature(draft);
    const normalized: CycleEntry = {
      ...draft,
      flow: draft.isPeriod ? draft.flow : "none",
      temperatureReadings: normalizeTemperatureReadings(draft),
      temperature: primaryTemperature?.value,
      questionableTemp: primaryTemperature?.isResting === false,
      updatedAt: new Date().toISOString(),
    };

    if (isDemoMode) {
      setEntries((current) => upsertEntry(current, normalized));
      setSaveState("saved");
      if (!options?.quiet) setStatus(`Registro demo de ${displayDate(normalized.date)} actualizado.`);
      return;
    }

    await saveEntry(normalized);
    const storedEntries = await getAllEntries();
    setEntries(storedEntries);
    setSaveState("saved");
    if (!options?.quiet) setStatus(`Registro de ${displayDate(normalized.date)} guardado.`);
    if (isSupabaseConfigured()) {
      void upsertSupabaseEntry(normalized).catch(() => {
        setStatus("Guardado en este dispositivo; no se pudo sincronizar con la nube.");
      });
    }
  }

  async function removeSelected() {
    const blankEntry = emptyEntry(selectedDate);
    setDraft(blankEntry);
    setLastTemperatureActionAt(0);
    setPrioritizedEntryDate(shouldPrioritizeDate(selectedDate, entries.filter((entry) => entry.date !== selectedDate)) ? selectedDate : null);

    if (isDemoMode) {
      setEntries((current) => current.filter((entry) => entry.date !== selectedDate));
      setStatus(`Registro demo de ${displayDate(selectedDate)} eliminado.`);
      return;
    }

    setEntries((current) => current.filter((entry) => entry.date !== selectedDate));
    await deleteEntry(selectedDate);
    if (isSupabaseConfigured()) {
      await deleteSupabaseEntry(selectedDate);
    }
    const storedEntries = await getAllEntries();
    setEntries(storedEntries);
    setStatus(`Registro de ${displayDate(selectedDate)} eliminado.`);
  }

  async function wipeData() {
    if (isDemoMode) {
      safeLocalSet("alba-demo-mode", "false");
      setIsDemoMode(false);
      setEntries(await getAllEntries());
      setStatus("Saliste del modo demo. Tus datos reales siguen intactos.");
      return;
    }

    if (!window.confirm("Esto borrará todos los registros de este dispositivo y de la nube compartida.")) return;
    try {
      if (isSupabaseConfigured()) {
        await deleteAllSupabaseEntries();
      }
      await clearEntries();
      setEntries([]);
      setStatus("Todos los datos fueron eliminados en local y nube.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudieron borrar todos los datos.");
    }
  }

  async function loadDemoData() {
    try {
      const imported = await loadMappedDemoEntries();
      safeLocalSet("alba-demo-mode", "true");
      setIsDemoMode(true);
      setEntries(imported);
      setPrioritizedEntryDate(shouldPrioritizeDate(imported.at(-1)?.date ?? isoDate(new Date()), imported) ? (imported.at(-1)?.date ?? isoDate(new Date())) : null);
      setSelectedDate(imported.at(-1)?.date ?? isoDate(new Date()));
      setVisibleMonth(new Date());
      setStatus("Modo demo activo con los últimos 90 días.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudieron cargar los datos de prueba.");
    }
  }

  async function exitDemoMode() {
    safeLocalSet("alba-demo-mode", "false");
    setIsDemoMode(false);
    const storedEntries = await getAllEntries();
    setEntries(storedEntries);
    setSelectedDate(isoDate(new Date()));
    setPrioritizedEntryDate(shouldPrioritizeDate(isoDate(new Date()), storedEntries) ? isoDate(new Date()) : null);
    setStatus("Modo demo desactivado. Volviste a tus datos reales.");
  }

  async function prepareCloudSync() {
    if (isDemoMode) {
      setStatus("El modo demo no se sincroniza. Sal del demo para probar la nube con datos reales.");
      return;
    }

    if (!isSupabaseConfigured()) {
      setStatus("Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para sincronizar.");
      return;
    }

    setIsPreparingSyncPreview(true);
    try {
      const sourceEntries = (await getAllEntries()).filter((entry) => !isDemoEntry(entry));
      const preview = await previewSyncWithSupabase(sourceEntries);
      setSyncPreview(preview);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo preparar el resumen de sync.");
    } finally {
      setIsPreparingSyncPreview(false);
    }
  }

  async function syncCloudData(options?: { quiet?: boolean; entriesOverride?: CycleEntry[] }) {
    if (isDemoMode) {
      if (!options?.quiet) setStatus("El modo demo no se sincroniza. Sal del demo para probar la nube con datos reales.");
      return;
    }

    if (!isSupabaseConfigured()) {
      if (!options?.quiet) setStatus("Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para sincronizar.");
      return;
    }

    setIsSyncing(true);
    lastCloudSyncAt.current = Date.now();
    try {
      const sourceEntries = (options?.entriesOverride ?? (await getAllEntries())).filter((entry) => !isDemoEntry(entry));
      const mergedEntries = await syncWithSupabase(sourceEntries);
      await replaceEntries(mergedEntries);
      setEntries(await getAllEntries());
      setSyncPreview(null);
      if (!options?.quiet) setStatus("Datos sincronizados con la nube.");
    } catch (error) {
      if (!options?.quiet) setStatus(error instanceof Error ? error.message : "No se pudo sincronizar.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function testCloudConnection() {
    if (!isSupabaseConfigured()) {
      setStatus("Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para probar Supabase.");
      return;
    }

    setIsTestingCloud(true);
    try {
      await testSupabaseConnection();
      setStatus("Conexión con la nube lista.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo probar Supabase.");
    } finally {
      setIsTestingCloud(false);
    }
  }

  async function enableTemperatureReminders() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      setStatus("Este navegador no permite notificaciones.");
      return;
    }

    if (Notification.permission === "denied") {
      setNotificationPermission("denied");
      setStatus("Las notificaciones están bloqueadas en este navegador.");
      return;
    }

    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission !== "granted") {
      setTemperatureRemindersEnabled(false);
      setStatus("No se activaron los recordatorios.");
      return;
    }

    setTemperatureRemindersEnabled(true);
    try {
      const pushReady = await registerDeviceForPush();
      setStatus(pushReady ? "Recordatorios activados." : "Recordatorios activados para esta sesión.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Recordatorios activos en este navegador.");
    }
  }

  function disableTemperatureReminders() {
    setTemperatureRemindersEnabled(false);
    setStatus("Recordatorios desactivados en este dispositivo.");
  }

  async function showTemperatureReminder({
    title,
    body,
    markAsShown = false,
    reminderKey,
  }: {
    title: string;
    body: string;
    markAsShown?: boolean;
    reminderKey?: string;
  }) {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      setNotificationPermission("Notification" in window ? Notification.permission : "unsupported");
      setStatus("Primero activa las notificaciones.");
      return;
    }

    const options: NotificationOptions = {
      body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: "alba-temperature-reminder",
    };

    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
    } else {
      new Notification(title, options);
    }

    if (markAsShown) {
      safeLocalSet(TEMPERATURE_REMINDER_LAST_SHOWN_KEY, reminderKey ?? isoDate(new Date()));
    }
  }

  async function registerDeviceForPush(): Promise<boolean> {
    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!import.meta.env.PROD || !publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !isSupabaseConfigured()) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription =
      existingSubscription ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(publicKey),
      }));

    await savePushSubscription(subscription);
    return true;
  }

  function addTemperature(value = pendingTemperature, site = pendingTemperatureSite) {
    setDraft((current) => ({
      ...current,
      temperatureReadings: [...current.temperatureReadings, createTemperatureReading(value, site)],
    }));
    setPendingTemperature(value);
    setPendingTemperatureInput(formatPendingTemperature(value));
    setPendingTemperatureSite(site);
  }

  function saveQuickTemperature() {
    if (registerTemperatureBlocked) {
      setStatus(parsedPendingTemperature === undefined ? "Introduce una temperatura válida." : "Pausa unos segundos antes de registrar otra toma similar.");
      return;
    }
    addTemperature(parsedPendingTemperature, pendingTemperatureSite);
    animateTemperatureToSavedRow(parsedPendingTemperature, pendingTemperatureSite);
    setLastTemperatureActionAt(Date.now());
  }

  function animateTemperatureToSavedRow(value: number, site: TemperatureSite) {
    const source = temperatureDisplayRef.current?.getBoundingClientRect();
    if (!source) return;

    const fromX = source.left + source.width / 2;
    const fromY = source.top + source.height / 2;
    const target = savedTemperaturesRef.current?.getBoundingClientRect();
    const toX = target ? target.left + target.width / 2 : source.left + source.width / 2;
    const toY = target ? target.top + 24 : source.bottom + 142 + Math.min(draft.temperatureReadings.length, 2) * 42;
    const id = Date.now();

    setTemperatureFlyer({
      id,
      value,
      site: temperatureSiteLabel(site),
      fromX,
      fromY,
      deltaX: toX - fromX,
      deltaY: toY - fromY,
    });
    window.setTimeout(() => {
      setTemperatureFlyer((current) => (current?.id === id ? null : current));
    }, 820);
  }

  function setPendingTemperatureValue(value: number) {
    const nextValue = clampTemperature(value);
    setPendingTemperature(nextValue);
    setPendingTemperatureInput(nextValue.toFixed(1));
  }

  function adjustPendingTemperature(delta: number) {
    setPendingTemperatureValue((parseTemperatureInput(pendingTemperatureInput) ?? pendingTemperature) + delta);
  }

  function commitPendingTemperatureInput() {
    const parsed = parseTemperatureInput(pendingTemperatureInput);
    if (parsed === undefined) {
      setPendingTemperatureInput(pendingTemperature.toFixed(1));
      return;
    }

    const nextValue = clampTemperature(parsed);
    setPendingTemperature(nextValue);
    setPendingTemperatureInput(formatPendingTemperature(nextValue));
  }

  function updateTemperature(id: string, changes: Partial<TemperatureReading>) {
    setDraft((current) => ({
      ...current,
      temperatureReadings: current.temperatureReadings.map((reading) =>
        reading.id === id ? { ...reading, ...changes } : reading,
      ),
    }));
  }

  function removeTemperature(id: string) {
    setDraft((current) => ({
      ...current,
      temperatureReadings: current.temperatureReadings.filter((reading) => reading.id !== id),
    }));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(buildExport(entries), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `alba-${isoDate(new Date())}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Exportación lista.");
  }

  async function importData(file?: File) {
    if (!file) return;
    try {
      const imported = parseImport(await file.text());
      safeLocalSet("alba-demo-mode", "false");
      setIsDemoMode(false);
      await replaceEntries(imported);
      setEntries(await getAllEntries());
      setStatus(`Importados ${imported.length} registros.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo importar el archivo.");
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  }

  async function generateInsight() {
    setIsInsightLoading(true);
    setInsight("");

    try {
      const result = await requestCycleInsight({ entries, stats, selectedDate });
      setInsight(result);
      setStatus("Explicación generada.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo generar la lectura.");
    } finally {
      setIsInsightLoading(false);
    }
  }

  function closeAnniversaryIntro() {
    safeSessionSet(`alba-anniversary-${isoDate(new Date())}`, "seen");
    setShowAnniversaryIntro(false);
  }

  function handleAnniversaryBrandTap(event: React.MouseEvent) {
    if (!isMonthlyAnniversary) {
      toggleTheme(event);
      return;
    }

    setAnniversaryTapCount((current) => {
      const next = current + 1;
      if (next >= 14) {
        setShowAnniversaryNote(true);
        return 0;
      }
      return next;
    });
  }

  function startAnniversaryLongPress() {
    if (!isMonthlyAnniversary) return;
    anniversaryLongPressTimer.current = window.setTimeout(() => setShowAnniversaryNote(true), 700);
  }

  function cancelAnniversaryLongPress() {
    if (anniversaryLongPressTimer.current !== null) {
      window.clearTimeout(anniversaryLongPressTimer.current);
      anniversaryLongPressTimer.current = null;
    }
  }

  function addAnniversarySparkle(event: React.PointerEvent<HTMLElement>) {
    if (!isMonthlyAnniversary || Date.now() - lastSparkleAt.current < 90) return;
    lastSparkleAt.current = Date.now();
    const sparkle = { id: Date.now(), x: event.clientX, y: event.clientY };
    setAnniversarySparkles((current) => [...current.slice(-10), sparkle]);
    window.setTimeout(() => {
      setAnniversarySparkles((current) => current.filter((item) => item.id !== sparkle.id));
    }, 900);
  }

  if (showBrandLab) {
    return <BrandLab theme={theme} onToggleTheme={toggleTheme} />;
  }

  return (
    <main className={isMonthlyAnniversary ? "anniversary-day min-h-screen bg-surface text-ink" : "min-h-screen bg-surface text-ink"} onPointerMove={addAnniversarySparkle}>
      {showAnniversaryIntro ? <AnniversaryIntro onClose={closeAnniversaryIntro} /> : null}
      {isMonthlyAnniversary ? <AnniversaryDayDecor /> : null}
      {anniversarySparkles.map((sparkle) => (
        <span className="pointer-sparkle" key={sparkle.id} style={{ left: sparkle.x, top: sparkle.y }} aria-hidden="true">
          ✦
        </span>
      ))}
      {showAnniversaryNote ? <AnniversaryNote onClose={() => setShowAnniversaryNote(false)} /> : null}
      {temperatureFlyer ? (
        <div
          className="temperature-flyer"
          style={
            {
              left: `${temperatureFlyer.fromX}px`,
              top: `${temperatureFlyer.fromY}px`,
              "--fly-x": `${temperatureFlyer.deltaX}px`,
              "--fly-y": `${temperatureFlyer.deltaY}px`,
            } as React.CSSProperties
          }
        >
          <strong>{temperatureFlyer.value.toFixed(1)} C</strong>
          <span>{temperatureFlyer.site}</span>
        </div>
      ) : null}
      {syncPreview ? renderSyncPreviewModal() : null}
      <section className="border-b border-outline bg-surface/95">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <div className="brand-lockup" aria-label="Alba">
              <button
                onClick={handleAnniversaryBrandTap}
                onPointerDown={startAnniversaryLongPress}
                onPointerUp={cancelAnniversaryLongPress}
                onPointerCancel={cancelAnniversaryLongPress}
                onPointerLeave={cancelAnniversaryLongPress}
                className={isMonthlyAnniversary ? "brand-mark anniversary-brand-mark" : "brand-mark"}
                aria-label={isMonthlyAnniversary ? "Sorpresa de mesario" : "Cambiar tema"}
                title={isMonthlyAnniversary ? `${anniversaryTapCount}/14` : "Cambiar tema"}
              >
                {theme === "dark" ? <Moon className="h-5 w-5" aria-hidden="true" /> : <Sun className="h-5 w-5" aria-hidden="true" />}
              </button>
              <h1 className="brand-word">Alba</h1>
            </div>

          </div>
          {status ? (
            <div className="rounded border border-moss bg-mossLight px-3 py-2 text-sm text-ink/80">
              <Info className="mr-2 inline h-4 w-4 text-moss" aria-hidden="true" />
              {status}
            </div>
          ) : null}
          {isDemoMode ? (
            <div className="rounded border border-marigold bg-marigoldLight px-3 py-2 text-sm leading-6 text-ink/80">
              Estás explorando datos demo. No se suben a la nube.
            </div>
          ) : null}
        </div>
      </section>

      <div className={isNavCompact ? "app-nav compact" : "app-nav"}>
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} className={activeTab === tab.id ? "tab-button active" : "tab-button"} type="button" onClick={() => setActiveTab(tab.id)}>
                <Icon aria-hidden="true" size={18} />
                <span className="tab-label">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {activeTab === "today" ? renderToday() : null}
        {activeTab === "calendar" ? renderCalendar() : null}
        {activeTab === "chart" ? renderChart() : null}
        {activeTab === "map" ? renderMap() : null}
        {activeTab === "ai" ? renderAi() : null}
        {activeTab === "settings" ? renderSettings() : null}
      </div>
    </main>
  );

  function renderSyncPreviewModal() {
    if (!syncPreview) return null;

    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="sync-preview-title">
        <section className="modal-panel sync-preview-panel">
          <div>
            <p className="eyebrow">Sincronización</p>
            <h2 id="sync-preview-title">Revisar antes de sincronizar</h2>
            <p>
              Alba va a mezclar los registros de este dispositivo con la nube. Esta sincronización normal no borra días; solo sube,
              descarga o conserva la versión más reciente cuando hay la misma fecha.
            </p>
          </div>

          <div className="sync-preview-grid">
            <SyncPreviewStat label="En este dispositivo" value={syncPreview.totalLocal} />
            <SyncPreviewStat label="En la nube" value={syncPreview.totalRemote} />
            <SyncPreviewStat label="Subir a nube" value={syncPreview.uploadOnly.length + syncPreview.localNewer.length} />
            <SyncPreviewStat label="Descargar aquí" value={syncPreview.downloadOnly.length + syncPreview.remoteNewer.length} />
          </div>

          <div className="sync-preview-list">
            <SyncPreviewDates label="Solo aquí, se subirán" dates={syncPreview.uploadOnly} />
            <SyncPreviewDates label="Solo en nube, se descargarán" dates={syncPreview.downloadOnly} />
            <SyncPreviewDates label="Aquí es más reciente" dates={syncPreview.localNewer} />
            <SyncPreviewDates label="Nube es más reciente" dates={syncPreview.remoteNewer} tone={syncPreview.remoteNewer.length > 0 ? "warm" : "default"} />
          </div>

          <div className="info-box">
            No se eliminará nada con este botón. Los borrados siguen ocurriendo solo desde “Eliminar día” o “Borrar”.
          </div>

          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={() => setSyncPreview(null)} disabled={isSyncing}>
              Cancelar
            </button>
            <button className="primary-button" type="button" onClick={() => syncCloudData()} disabled={isSyncing}>
              <Database aria-hidden="true" size={17} />
              {isSyncing ? "Sincronizando..." : "Confirmar sync"}
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderCalendar() {
    return (
      <Panel>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-moss" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Calendario</h2>
          </div>
          <div className="flex items-center gap-2">
            <button className="icon-button compact" title="Mes anterior" onClick={() => setVisibleMonth(subMonths(visibleMonth, 1))} type="button">
              <ChevronLeft aria-hidden="true" size={17} />
            </button>
            <span className="min-w-36 text-center text-sm font-medium capitalize text-ink">
              {format(visibleMonth, "MMMM yyyy", { locale: es })}
            </span>
            <button className="icon-button compact" title="Mes siguiente" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))} type="button">
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
                onClick={() => {
                  setSelectedDate(date);
                  setActiveTab("today");
                }}
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

  function renderChart() {
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
            <button className="icon-button compact" title="Ver días anteriores" type="button" disabled={!canMoveChartLeft} onClick={() => setChartEndIndex((current) => Math.max(chartWindow - 1, current - chartWindow))}>
              <ChevronLeft aria-hidden="true" size={17} />
            </button>
            <button className="icon-button compact" title="Alejar" type="button" disabled={chartWindow >= 60} onClick={() => setChartWindow((current) => Math.min(60, current + 7))}>
              <ZoomOut aria-hidden="true" size={17} />
            </button>
            <button className="icon-button compact" title="Acercar" type="button" disabled={chartWindow <= 7} onClick={() => setChartWindow((current) => Math.max(7, current - 7))}>
              <ZoomIn aria-hidden="true" size={17} />
            </button>
            <button className="icon-button compact" title="Ver días siguientes" type="button" disabled={!canMoveChartRight} onClick={() => setChartEndIndex((current) => Math.min(allChartData.length - 1, current + chartWindow))}>
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

  function renderToday() {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
        <Panel className={shouldPrioritizeEntry ? "order-2" : ""}>
          <div className="day-summary-head">
            <div>
              <p className="text-sm text-ink/70">{displayDate(selectedDate, "EEEE")}</p>
              <h2 className="text-xl font-semibold capitalize">{displayDate(selectedDate)}</h2>
            </div>
            <div className="day-summary-side">
              {saveFeedback !== "idle" ? <SaveFeedback state={saveFeedback} /> : null}
            </div>
          </div>
          <div className="day-summary-grid">
            <PhaseStat phase={selectedPhase} />
            <Stat label="Día del ciclo" value={selectedPhase?.cycleDay ? String(selectedPhase.cycleDay) : "Pendiente"} />
            <Stat label="Próximo periodo" value={estimatedNextPeriod ? displayDate(estimatedNextPeriod, "d 'de' MMMM") : "Pendiente"} />
            <Stat label="Temperatura" value={getPrimaryTemperature(draft) ? `${getPrimaryTemperature(draft)!.value.toFixed(1)} C` : "Pendiente"} />
          </div>
          <div className="phase-human-note" style={selectedPhase ? { borderColor: phaseMeta[selectedPhase.phase].color } : undefined}>
            {phaseHumanText(selectedPhase)}
          </div>
        </Panel>

        <Panel className={shouldPrioritizeEntry ? "order-1" : ""}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Registro del día</h2>
            <button className="icon-button danger" title="Eliminar todos los registros de este día" onClick={() => setShowDeleteDayConfirm(true)} type="button">
              <Trash2 aria-hidden="true" size={18} />
            </button>
          </div>
          {showDeleteDayConfirm ? (
            <div className="confirm-box">
              <strong>Eliminar registros del día</strong>
              <span>Esto borrará el periodo, temperaturas, señales y notas de {displayDate(selectedDate)}.</span>
              <div className="flex gap-2">
                <button className="secondary-button danger" type="button" onClick={() => { void removeSelected(); setShowDeleteDayConfirm(false); }}>
                  Eliminar día
                </button>
                <button className="secondary-button" type="button" onClick={() => setShowDeleteDayConfirm(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
          <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
            <div className={saveFeedback === "saved" ? "input-card primary-entry-card saved-glow" : "input-card primary-entry-card"}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="eyebrow">Principal</span>
                  <h3>Temperatura de hoy</h3>
                  <p>Escribe la temperatura. La hora se guarda sola al registrar la toma.</p>
                </div>
              </div>

              <div className="temperature-picker" aria-label="Temperatura">
                <button className="temp-stepper" type="button" aria-label="Bajar temperatura" onClick={() => adjustPendingTemperature(-0.1)}>
                  <Minus aria-hidden="true" size={20} />
                </button>
                <label className="temperature-display" ref={temperatureDisplayRef}>
                  <input
                    aria-label="Temperatura"
                    type="text"
                    inputMode="decimal"
                    placeholder="36.90"
                    value={pendingTemperatureInput}
                    onBlur={commitPendingTemperatureInput}
                    onChange={(event) => setPendingTemperatureInput(cleanTemperatureInput(event.target.value))}
                  />
                  <span>C</span>
                </label>
                <button className="temp-stepper" type="button" aria-label="Subir temperatura" onClick={() => adjustPendingTemperature(0.1)}>
                  <Plus aria-hidden="true" size={20} />
                </button>
              </div>

              <div className="temperature-options">
                <select
                  className="input mt-0"
                  aria-label="Lugar de medicion"
                  value={pendingTemperatureSite}
                  onChange={(event) => {
                    const site = event.target.value as TemperatureSite;
                    setPendingTemperatureSite(site);
                  }}
                >
                  {temperatureSiteOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label className="mini-check">
                  <input type="checkbox" checked readOnly />
                  Reposo
                </label>
              </div>

              <button className="temperature-submit" type="button" onClick={saveQuickTemperature} disabled={registerTemperatureBlocked}>
                <Plus aria-hidden="true" size={17} />
                {registerTemperatureBlocked ? "Temperatura ya tomada" : "Registrar temperatura"}
              </button>

              {draft.temperatureReadings.length > 0 ? (
                <div className="temperature-saved-list" ref={savedTemperaturesRef}>
                  {draft.temperatureReadings
                    .map((reading) => (
                      <details className="temperature-saved-row" key={reading.id}>
                        <summary>
                          <strong>{reading.value.toFixed(1)} C</strong>
                          <span>{temperatureSiteLabel(reading.site)}</span>
                          <span>{reading.time}</span>
                          <span>{reading.isResting ? "Reposo" : "Dudosa"}</span>
                        </summary>
                        <div className="temperature-edit-row">
                          <input
                            aria-label="Temperatura guardada"
                            className="input mt-0"
                            type="number"
                            inputMode="decimal"
                            min="34"
                            max="42"
                            step="0.1"
                            value={reading.value.toFixed(1)}
                            onChange={(event) => updateTemperature(reading.id, { value: clampTemperature(Number(event.target.value)) })}
                          />
                          <select className="input mt-0" aria-label="Lugar de medicion" value={reading.site} onChange={(event) => updateTemperature(reading.id, { site: event.target.value as TemperatureSite })}>
                            {temperatureSiteOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <input aria-label="Hora de la toma" className="input mt-0" type="time" value={reading.time} onChange={(event) => updateTemperature(reading.id, { time: event.target.value })} />
                          <label className="mini-check">
                            <input type="checkbox" checked={reading.isResting} onChange={(event) => updateTemperature(reading.id, { isResting: event.target.checked })} />
                            Reposo
                          </label>
                          <button className="icon-button compact danger" title="Quitar temperatura" type="button" onClick={() => removeTemperature(reading.id)}>
                            <Trash2 aria-hidden="true" size={16} />
                          </button>
                        </div>
                      </details>
                    ))}
                </div>
              ) : null}
            </div>

            <div className={periodNeedsAttention ? "input-card period-card attention" : "input-card period-card"}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3>Periodo</h3>
                  <p>{periodNeedsAttention ? "Como venías registrando sangrado, confirma si hoy continúa." : "Marca solo si hoy hubo sangrado. Si no, puedes dejarlo apagado."}</p>
                </div>
                {periodNeedsAttention ? <span className="saved-pill warm">Revisar</span> : null}
              </div>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={draft.isPeriod}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      isPeriod: event.target.checked,
                      flow: event.target.checked ? (current.flow === "none" ? "light" : current.flow) : "none",
                    }))
                  }
                />
                <span>{draft.isPeriod ? "Sí, hubo sangrado" : "No hubo sangrado"}</span>
              </label>

              {draft.isPeriod ? (
                <div>
                  <label className="field-label" htmlFor="flow">
                    Flujo menstrual
                  </label>
                  <select id="flow" className="input" value={draft.flow} onChange={(event) => setDraft((current) => ({ ...current, flow: event.target.value as FlowLevel }))}>
                    {flowOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div className="input-card">
              <h3>Señales opcionales</h3>
              <p>El flujo cervical y el cuello uterino te dan más pistas de tus fases, pero no es necesario llenarlos siempre.</p>
              <label className="toggle-row">
                <input type="checkbox" checked={showAdvanced} onChange={(event) => setShowAdvanced(event.target.checked)} />
                <span>Añadir más información</span>
              </label>

            {showAdvanced ? renderAdvancedFields() : null}
            </div>

            <div className="input-card">
              <h3>Nota libre</h3>
            <div>
              <label className="field-label" htmlFor="note">
                Nota
              </label>
              <textarea id="note" className="input min-h-28 resize-y" placeholder="Ej: dormí poco, fiebre, dolor, viaje..." value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} />
            </div>
            </div>

            {saveFeedback !== "idle" ? <div className="save-strip"><SaveFeedback state={saveFeedback} /></div> : null}
          </form>
        </Panel>
      </div>
    );
  }

  function renderAdvancedFields() {
    return (
      <div className="advanced-panel space-y-4">
        <div className="info-box">
          <strong>Como observar:</strong> el flujo cervical puede revisarse al ir al baño o por la sensación durante el día.
          El cuello uterino debe observarse con manos limpias, con suavidad y sin forzar.
        </div>
        <div>
          <label className="field-label" htmlFor="mucus">
            Moco cervical
          </label>
          <select id="mucus" className="input" value={draft.cervicalMucus ?? ""} onChange={(event) => setDraft((current) => ({ ...current, cervicalMucus: (event.target.value || undefined) as CervicalMucus | undefined }))}>
            {mucusOptions.map((option) => (
              <option key={option.value || "none"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <AdvancedSelect id="cervix-height" label="Cuello: altura" value={draft.cervixHeight ?? ""} options={cervixHeightOptions} onChange={(value) => setDraft((current) => ({ ...current, cervixHeight: (value || undefined) as CervixHeight | undefined }))} />
          <AdvancedSelect id="cervix-firmness" label="Textura" value={draft.cervixFirmness ?? ""} options={cervixFirmnessOptions} onChange={(value) => setDraft((current) => ({ ...current, cervixFirmness: (value || undefined) as CervixFirmness | undefined }))} />
          <AdvancedSelect id="cervix-open" label="Apertura" value={draft.cervixOpenness ?? ""} options={cervixOpennessOptions} onChange={(value) => setDraft((current) => ({ ...current, cervixOpenness: (value || undefined) as CervixOpenness | undefined }))} />
        </div>
      </div>
    );
  }

  function renderMap() {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-moss" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Tu mapa</h2>
          </div>
          <div
            ref={mapRef}
            className="phase-strip"
            role="list"
            aria-label="Fases del ciclo"
            onMouseLeave={() => {
              if (!mapTooltip?.pinned) setMapTooltip(null);
            }}
          >
            {phaseSegments.map((segment) => {
              const meta = phaseMeta[segment.phase];
              return (
                <div className="phase-block" key={segment.id} role="listitem">
                  {segment.days.map((day, index) => (
                    <Tippy
                      key={day.date}
                      content={<PhaseSegmentTooltip segment={segment} />}
                      animation="shift-away-subtle"
                      duration={[160, 140]}
                      hideOnClick={false}
                      interactive
                      interactiveBorder={18}
                      maxWidth={320}
                      offset={[0, 10]}
                      onClickOutside={() => setMapTooltip(null)}
                      placement="bottom"
                      popperOptions={{
                        modifiers: [
                          { name: "flip", options: { fallbackPlacements: ["bottom", "right", "left"] } },
                          { name: "preventOverflow", options: { padding: { top: 96, right: 16, bottom: 16, left: 16 } } },
                        ],
                      }}
                      theme="alba"
                      trigger="manual"
                      visible={mapTooltip?.segmentId === segment.id && mapTooltip.anchorDate === day.date}
                      disabled={isMobileMap}
                    >
                      <button
                        className={segment.id === activeMapSegment?.id ? "phase-chip active" : "phase-chip"}
                        type="button"
                        style={{ background: meta.soft, borderColor: meta.color }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setFocusedSegmentId(segment.id);
                          setSelectedDate(day.date);
                          setMapTooltip(isMobileMap ? null : { segmentId: segment.id, anchorDate: day.date, pinned: true });
                        }}
                        onFocus={() => {
                          setFocusedSegmentId(segment.id);
                          if (!isMobileMap && !mapTooltip?.pinned && mapTooltip?.segmentId !== segment.id) setMapTooltip({ segmentId: segment.id, anchorDate: day.date, pinned: false });
                        }}
                        onMouseEnter={() => {
                          setFocusedSegmentId(segment.id);
                          if (isMobileMap || mapTooltip?.pinned) return;
                          if (mapTooltip?.segmentId === segment.id) return;
                          setMapTooltip({ segmentId: segment.id, anchorDate: day.date, pinned: false });
                        }}
                      >
                        <span>{index === 0 ? segment.days.length : displayDate(day.date, "d")}</span>
                      </button>
                    </Tippy>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="phase-legend mt-4 gap-2 sm:grid-cols-2">
            {Object.entries(phaseMeta).map(([key, meta]) => (
              <button
                className={key === activeMapPhase ? "legend-row active" : "legend-row"}
                key={key}
                type="button"
                onClick={() => {
                  const segment = phaseSegments.find((item) => item.phase === key);
                  setFocusedSegmentId(segment?.id ?? null);
                  setMapTooltip(segment && !isMobileMap ? { segmentId: segment.id, anchorDate: segment.start, pinned: true } : null);
                  if (segment) setSelectedDate(segment.start);
                }}
                onFocus={() => setFocusedSegmentId(phaseSegments.find((segment) => segment.phase === key)?.id ?? null)}
                onMouseEnter={() => {
                  if (isMobileMap || mapTooltip?.pinned) return;
                  const segment = phaseSegments.find((item) => item.phase === key);
                  setFocusedSegmentId(segment?.id ?? null);
                  setMapTooltip(segment ? { segmentId: segment.id, anchorDate: segment.start, pinned: false } : null);
                }}
              >
                <span style={{ background: meta.color }} />
                {meta.label}
              </button>
            ))}
          </div>
          <div className="phase-focus-card mt-4" style={{ borderColor: activeMapMeta.color }}>
            <strong style={{ color: activeMapMeta.color }}>{activeMapMeta.label}</strong>
            <span>{activeMapSegment ? `${displayDate(activeMapSegment.start)} - ${displayDate(activeMapSegment.end)} · ${activeMapSegment.days.length} día${activeMapSegment.days.length === 1 ? "" : "s"}` : phaseExplanation(activeMapPhase)}</span>
            <ul>
              {(activeMapSegment?.insights ?? ["Aún faltan datos para interpretar este bloque."]).map((insight) => (
                <li key={insight}>{insight}</li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-moss" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Resumen detallado</h2>
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <Stat label="Fase actual" value={selectedPhase?.label ?? "Sin datos"} />
            <Stat label="Confianza" value={selectedPhase?.confidence ?? "Pendiente"} />
            <Stat label="Día del ciclo" value={selectedPhase?.cycleDay ? String(selectedPhase.cycleDay) : "Pendiente"} />
            <Stat label="Promedio ciclo" value={stats.averageCycleLength ? `${stats.averageCycleLength} días` : "Pendiente"} />
            <Stat label="Flujo cervical" value={optionLabel(mucusOptions, draft.cervicalMucus)} />
            <Stat label="Cuello uterino" value={`${optionLabel(cervixHeightOptions, draft.cervixHeight)} / ${optionLabel(cervixFirmnessOptions, draft.cervixFirmness)}`} />
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

  function renderAi() {
    return (
      <Panel>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-marigold" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Asistente Alba</h2>
          </div>
          <button className="icon-button compact" title="Consultar a Alba" onClick={generateInsight} disabled={isInsightLoading || entries.length === 0} type="button">
            {isInsightLoading ? <Loader2 className="animate-spin" aria-hidden="true" size={17} /> : <Sparkles aria-hidden="true" size={17} />}
          </button>
        </div>
        <div className="info-box warning">
          Alba revisa tus registros solo cuando presionas este botón. Es orientativa y no diagnostica.
        </div>
        <div className="mt-3 min-h-32 whitespace-pre-wrap rounded border border-outline bg-surface/70 p-3 text-sm leading-6 text-ink/86">
          {insight || (entries.length ? "Consulta a Alba cuando quieras revisar patrones del ciclo." : "Agrega datos para consultar a Alba.")}
        </div>
      </Panel>
    );
  }

  function renderSettings() {
    return (
      <Panel>
        <div className="mb-4 flex items-center gap-2">
          <Database className="h-5 w-5 text-moss" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Ajustes</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className={isDemoMode ? "secondary-button active-demo" : "secondary-button"} type="button" onClick={isDemoMode ? exitDemoMode : loadDemoData}>
            <Database aria-hidden="true" size={17} />
            {isDemoMode ? "Salir demo" : "Demo"}
          </button>
          <button className="secondary-button" type="button" onClick={exportData}>
            <Download aria-hidden="true" size={17} />
            Exportar
          </button>
          <button className="secondary-button" type="button" onClick={() => importInput.current?.click()}>
            <FileUp aria-hidden="true" size={17} />
            Importar
          </button>
          <button className="secondary-button danger" type="button" onClick={wipeData}>
            <Eraser aria-hidden="true" size={17} />
            Borrar
          </button>
          <button className="secondary-button col-span-2" type="button" onClick={testCloudConnection} disabled={isTestingCloud}>
            <Database aria-hidden="true" size={17} />
            {isTestingCloud ? "Probando..." : "Probar conexion Supabase"}
          </button>
          <button className="secondary-button col-span-2" type="button" onClick={prepareCloudSync} disabled={isSyncing || isPreparingSyncPreview || isDemoMode}>
            <Database aria-hidden="true" size={17} />
            {isDemoMode ? "Demo sin sync" : isSyncing ? "Sincronizando..." : isPreparingSyncPreview ? "Preparando..." : "Sincronizar nube"}
          </button>
        </div>
        <div className="input-card mt-4">
          <div className="mb-3 flex items-start gap-3">
            <Bell className="mt-0.5 h-5 w-5 text-marigold" aria-hidden="true" />
            <div>
              <h3>Recordatorios</h3>
              <p>
                Alba puede recordarte la temperatura por la mañana. En producción también podrá avisar aunque no tengas la app abierta.
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {temperatureRemindersEnabled && notificationPermission === "granted" ? (
              <button className="secondary-button danger" type="button" onClick={disableTemperatureReminders}>
                <Bell aria-hidden="true" size={17} />
                Desactivar
              </button>
            ) : (
              <button className="secondary-button" type="button" onClick={enableTemperatureReminders} disabled={notificationPermission === "unsupported"}>
                <Bell aria-hidden="true" size={17} />
                Activar recordatorios
              </button>
            )}
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                showTemperatureReminder({
                  ...temperatureReminderCopy(),
                })
              }
              disabled={notificationPermission !== "granted"}
            >
              <Sparkles aria-hidden="true" size={17} />
              Probar mensaje
            </button>
          </div>
          <p className="mt-2 text-xs text-ink/60">
            Estado: {notificationPermission === "unsupported" ? "no soportado" : notificationPermission === "granted" ? "permitidas" : notificationPermission === "denied" ? "bloqueadas" : "sin decidir"}.
          </p>
        </div>
        <div className="anniversary-countdown mt-3">
          <span>Próximo mesario</span>
          <strong>{daysUntilNextMonthiversary()} días</strong>
          <small>El 6 vuelve Mandarino.</small>
        </div>
        <div className="info-box mt-3">
          Sync usa Supabase con <strong>couple_id = 1</strong>. Los datos demo son solo para explorar y nunca se suben.
        </div>
        <input ref={importInput} className="hidden" type="file" accept="application/json" onChange={(event) => importData(event.target.files?.[0])} />
      </Panel>
    );
  }
}

function phaseExplanation(phase: string): string {
  if (phase === "period") return "Días donde se registró sangrado.";
  if (phase === "follicular") return "El cuerpo se prepara para ovular; suele venir después del periodo.";
  if (phase === "fertile") return "Ventana estimada donde conviene observar flujo y temperatura.";
  if (phase === "possible-ovulation") return "Día probable, no seguro. Alba lo estima con calendario y subida térmica.";
  if (phase === "thermal-shift") return "La temperatura podría estar cambiando; se observa si se sostiene.";
  if (phase === "luteal") return "Fase posterior a ovulación probable; la temperatura suele verse más alta.";
  return "Rango estimado donde podría iniciar el siguiente periodo.";
}

function temperatureReminderCopy(): { title: string; body: string } {
  const title =
    new Date().getDate() === 6
      ? MONTHLY_ANNIVERSARY_TITLE
      : `${pickRandom(MORNING_GREETINGS)} ${pickRandom(MORNING_ENDEARMENTS)} ${pickRandom(MORNING_FACE_EMOJIS)}${pickRandom(MORNING_HEART_EMOJIS)}`;
  return {
    title,
    body: pickRandom(TEMPERATURE_REMINDER_BODIES),
  };
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function temperatureReminderSlot(date: Date): (typeof TEMPERATURE_REMINDER_SLOTS)[number] | undefined {
  const hour = date.getHours();
  return TEMPERATURE_REMINDER_SLOTS.find((slot) => hour >= slot.startHour && hour <= slot.endHour);
}

function daysUntilNextMonthiversary(): number {
  const today = new Date();
  const next = today.getDate() < 6
    ? new Date(today.getFullYear(), today.getMonth(), 6)
    : new Date(today.getFullYear(), today.getMonth() + 1, 6);
  return Math.max(1, differenceInCalendarDays(next, today));
}

function clampTemperature(value: number): number {
  if (!Number.isFinite(value)) return 36.9;
  return Math.min(42, Math.max(34, Math.round(value * 100) / 100));
}

function cleanTemperatureInput(value: string): string {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = normalized.split(".");
  const decimal = rest.join("").slice(0, 2);
  return rest.length > 0 ? `${whole.slice(0, 2)}.${decimal}` : whole.slice(0, 2);
}

function parseTemperatureInput(value: string): number | undefined {
  if (!value || value === ".") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 34 || parsed > 42) return undefined;
  return parsed;
}

function formatPendingTemperature(value: number): string {
  return Number.isInteger(value * 10) ? value.toFixed(1) : value.toFixed(2);
}

function shouldSurfacePeriod(entries: CycleEntry[], selectedDate: string, draft: CycleEntry): boolean {
  if (draft.isPeriod) return true;

  const selected = parseISO(selectedDate);
  const recentEntries = entries
    .filter((entry) => entry.date < selectedDate)
    .filter((entry) => differenceInCalendarDays(selected, parseISO(entry.date)) <= 7)
    .sort((a, b) => b.date.localeCompare(a.date));
  const lastPeriod = recentEntries.find((entry) => entry.isPeriod);

  if (!lastPeriod) return false;
  const daysSinceLastPeriod = differenceInCalendarDays(selected, parseISO(lastPeriod.date));
  if (daysSinceLastPeriod < 1 || daysSinceLastPeriod > 7) return false;

  const newerNonPeriodEntry = recentEntries.some((entry) => entry.date > lastPeriod.date && !entry.isPeriod);
  return !newerNonPeriodEntry;
}

function shouldPrioritizeDate(date: string, entries: CycleEntry[]): boolean {
  if (date !== isoDate(new Date())) return false;
  const entry = entries.find((item) => item.date === date);
  return !entry || entry.temperatureReadings.length === 0;
}

function hasSameMinuteTemperature(entry: CycleEntry, value: number, site: TemperatureSite): boolean {
  const currentTime = new Date().toTimeString().slice(0, 5);
  return entry.temperatureReadings.some((reading) => reading.time === currentTime && reading.site === site && Math.abs(reading.value - value) < 0.05);
}

function getLatestTemperatureBefore(entries: CycleEntry[], selectedDate: string): TemperatureReading | undefined {
  return [...entries]
    .filter((entry) => entry.date < selectedDate && entry.temperatureReadings.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((entry) => getPrimaryTemperature(entry))
    .find((reading): reading is TemperatureReading => Boolean(reading));
}

function temperatureSiteLabel(site: TemperatureSite): string {
  return temperatureSiteOptions.find((option) => option.value === site)?.label ?? "Bucal";
}

interface PhaseSegment {
  id: string;
  phase: CyclePhase;
  start: string;
  end: string;
  days: PhaseDay[];
  sourcePhases: CyclePhase[];
  confidence: string;
  insights: string[];
}

function buildPhaseSegments(days: Array<PhaseDay | undefined>, entries: CycleEntry[]): PhaseSegment[] {
  const filtered = days.filter((day): day is PhaseDay => Boolean(day));
  const segments: Omit<PhaseSegment, "id" | "confidence" | "insights" | "sourcePhases">[] = [];

  for (const day of filtered) {
    const displayPhase = mapPhaseForTimeline(day.phase);
    const last = segments.at(-1);
    if (!last || last.phase !== displayPhase) {
      segments.push({ phase: displayPhase, start: day.date, end: day.date, days: [day] });
      continue;
    }

    last.end = day.date;
    last.days.push(day);
  }

  return segments.map((segment, index) => ({
    ...segment,
    id: `${segment.phase}-${segment.start}-${index}`,
    sourcePhases: Array.from(new Set(segment.days.map((day) => day.phase))),
    confidence: segmentConfidence(segment.days),
    insights: getPhaseSegmentInsights(segment, entries),
  }));
}

function mapPhaseForTimeline(phase: CyclePhase): CyclePhase {
  return phase === "possible-ovulation" ? "fertile" : phase;
}

function segmentConfidence(days: PhaseDay[]): string {
  if (days.some((day) => day.confidence === "alta")) return "alta";
  if (days.some((day) => day.confidence === "media")) return "media";
  return "baja";
}

function getPhaseSegmentInsights(segment: { phase: CyclePhase; start: string; end: string; days: PhaseDay[] }, entries: CycleEntry[]): string[] {
  const segmentEntries = entries.filter((entry) => entry.date >= segment.start && entry.date <= segment.end);
  const insights: string[] = [];
  const temps = segmentEntries.map((entry) => getOralTemperature(entry)?.value).filter((value): value is number => typeof value === "number");
  const mucus = segmentEntries.map((entry) => entry.cervicalMucus).filter(Boolean);

  if (segment.phase === "period") {
    const flows = segmentEntries.map((entry) => entry.flow).filter((flow) => flow && flow !== "none");
    const dominantFlow = mostCommon(flows);
    insights.push(`Duración registrada: ${segment.days.length} día${segment.days.length === 1 ? "" : "s"}.`);
    insights.push(dominantFlow ? `Flujo predominante: ${optionLabel(flowOptions, dominantFlow).toLowerCase()}.` : "Falta registrar intensidad de flujo.");
    insights.push(segment.days.length >= 2 && segment.days.length <= 7 ? "Duracion dentro de un rango menstrual comun." : "Duracion fuera de lo comun; conviene observar si se repite.");
  } else if (segment.phase === "fertile") {
    const ovulationDays = segment.days.filter((day) => day.phase === "possible-ovulation");
    insights.push(`Ventana estimada de ${segment.days.length} día${segment.days.length === 1 ? "" : "s"}.`);
    if (ovulationDays.length > 0) {
      insights.push(`Posible ovulación alrededor de ${ovulationDays.map((day) => displayDate(day.date)).join(", ")}.`);
    }
    insights.push(mucus.length ? `Flujo observado: ${mucus.map((value) => optionLabel(mucusOptions, value)).join(", ")}.` : "Sin flujo cervical registrado en este bloque.");
    insights.push("Alba la trata como estimacion educativa, no confirmacion.");
  } else if (segment.phase === "possible-ovulation") {
    insights.push("Punto probable de ovulación, no confirmación.");
    insights.push(mucus.includes("eggwhite") ? "Hay flujo tipo clara de huevo registrado cerca." : "Sin clara de huevo registrada en este bloque.");
    insights.push(temps.length ? `Temperatura en este bloque: ${formatTempRange(temps)}.` : "Faltan tomas para apoyar la lectura.");
  } else if (segment.phase === "thermal-shift") {
    insights.push("Bloque donde Alba busca si la subida térmica se sostiene.");
    insights.push(temps.length >= 2 ? `Temperaturas: ${formatTempRange(temps)}.` : "Faltan temperaturas para evaluar tendencia.");
    insights.push(temps.length >= 2 && temps.at(-1)! > temps[0] ? "Se ve una tendencia de subida dentro del bloque." : "Todavia no se ve una subida clara dentro del bloque.");
  } else if (segment.phase === "luteal") {
    insights.push(`Fase lútea estimada de ${segment.days.length} día${segment.days.length === 1 ? "" : "s"} en esta vista.`);
    insights.push(temps.length ? `Temperatura promedio: ${average(temps).toFixed(1)} C.` : "Sin suficientes tomas en este bloque.");
    insights.push("Si la temperatura se mantiene más alta, refuerza la lectura lútea.");
  } else if (segment.phase === "expected-period") {
    insights.push("Inicio estimado por promedio de ciclos.");
    insights.push("No es una indicación médica ni fertilidad segura.");
  } else {
    insights.push(`Fase folicular estimada de ${segment.days.length} día${segment.days.length === 1 ? "" : "s"}.`);
    insights.push(temps.length ? `Temperaturas registradas: ${temps.length}.` : "Aún sin temperaturas en este bloque.");
    insights.push("Suele ser el tramo de preparacion antes de la ventana fertil.");
  }

  insights.push(`Confianza agregada ${segmentConfidence(segment.days)}.`);
  return insights;
}

function mostCommon<T extends string>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatTempRange(values: number[]): string {
  if (values.length === 0) return "sin datos";
  return `${Math.min(...values).toFixed(1)}-${Math.max(...values).toFixed(1)} C`;
}

function AdvancedSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value || "none"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`panel rounded border border-outline bg-surface p-4 shadow-soft sm:p-5 ${className}`}>{children}</section>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="grid h-full place-items-center rounded border border-dashed border-outline text-center text-sm text-ink/60">{text}</div>;
}

function PhaseStat({ phase }: { phase?: PhaseDay }) {
  const meta = phase ? phaseMeta[phase.phase] : undefined;

  return (
    <div className="phase-stat" style={meta ? { borderColor: meta.color, background: meta.soft } : undefined}>
      <dt>Fase actual</dt>
      <dd>
        {meta ? <span style={{ background: meta.color }} /> : null}
        {phase?.label ?? "Sin datos"}
      </dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-outline bg-surface/70 p-3">
      <dt className="text-xs font-medium uppercase tracking-[0.12em] text-ink/58">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}

function SyncPreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="sync-preview-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SyncPreviewDates({ label, dates, tone = "default" }: { label: string; dates: string[]; tone?: "default" | "warm" }) {
  const visibleDates = dates.slice(0, 5);
  const remaining = Math.max(0, dates.length - visibleDates.length);

  return (
    <div className={tone === "warm" ? "sync-preview-dates warm" : "sync-preview-dates"}>
      <div>
        <strong>{label}</strong>
        <span>{dates.length}</span>
      </div>
      {dates.length > 0 ? (
        <p>
          {visibleDates.map((date) => displayDate(date, "d MMM")).join(", ")}
          {remaining > 0 ? `, +${remaining} más` : ""}
        </p>
      ) : (
        <p>Sin cambios.</p>
      )}
    </div>
  );
}

function phaseHumanText(phase?: PhaseDay): string {
  if (!phase) return "Añade la última menstruación para ubicar mejor el ciclo.";

  if (phase.phase === "period") return "Día marcado con sangrado. Alba lo usa como punto de inicio del ciclo.";
  if (phase.phase === "follicular") return "Probable fase folicular: el cuerpo se prepara para ovular. Aún no hace falta sacar conclusiones fuertes.";
  if (phase.phase === "fertile") return "Ventana fértil estimada por calendario. El flujo cervical y la temperatura ayudan a afinarla.";
  if (phase.phase === "possible-ovulation") return "Posible ovulación estimada. No es confirmación; solo una pista para observar los próximos días.";
  if (phase.phase === "thermal-shift") return "Alba ve una posible transición térmica. Si se sostiene, puede reforzar la lectura de fase lútea.";
  if (phase.phase === "luteal") return "Probable fase lútea por el día del ciclo. Las próximas temperaturas ayudarán a confirmarlo.";
  return "Rango donde podría acercarse el siguiente periodo.";
}

function SaveFeedback({ state }: { state: "saving" | "saved" }) {
  return (
    <span className={state === "saved" ? "save-feedback saved" : "save-feedback"}>
      <span aria-hidden="true" />
      {state === "saved" ? "Listo" : "Guardando"}
    </span>
  );
}

function PhaseSegmentTooltip({ segment }: { segment: PhaseSegment }) {
  const meta = phaseMeta[segment.phase];
  const insights = segment.insights;
  const ovulationDay = segment.days.find((day) => day.phase === "possible-ovulation");

  return (
    <div className="phase-tooltip">
      <div className="phase-tooltip-header">
        <span className="phase-tooltip-dot" style={{ background: meta.color }} />
        <div>
          <strong>{meta.label}</strong>
          <span>
            {displayDate(segment.start)} - {displayDate(segment.end)} · {segment.days.length} día{segment.days.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      {ovulationDay ? <div className="phase-tooltip-pill">Posible ovulación · {displayDate(ovulationDay.date)}</div> : null}
      <ul className="phase-tooltip-list">
        {insights.map((insight) => (
          <li key={insight}>{insight}</li>
        ))}
      </ul>
    </div>
  );
}

function AnniversaryIntro({ onClose }: { onClose: () => void }) {
  return (
    <div className="anniversary-story mandarin-story" aria-label="Sorpresa de aniversario">
      <button className="anniversary-close" type="button" onClick={onClose} aria-label="Saltar intro">
        Entrar a Alba
      </button>
      <AnniversaryConfetti />
      <section className="mandarin-hero">
        <div className="cat-family" aria-label="Mandarino y sus amigos">
          <AnniversaryCat kind="black" label="Gatito negro" />
          <AnniversaryCat kind="orange" label="Mandarino" />
          <AnniversaryCat kind="siamese" label="Gatito siamés" />
        </div>
        <p>14 meses</p>
        <h2>Hoy Mandarino tiene una misión para nosotros</h2>
        <span>Preparar algo frío, dulce y nuestro.</span>
      </section>

      <section className="recipe-mission">
        <div className="recipe-heading">
          <p>Nuestra receta</p>
          <h2>Postre helado de mandarina y coco</h2>
          <span>Brillante, cremoso, refrescante y con chocolate oscuro.</span>
        </div>

        <div className="recipe-columns">
          <article>
            <span className="recipe-step-number">Antes</span>
            <h3>Tu parte secreta</h3>
            <ul>
              <li>Pelar 8–12 mandarinas y retirar toda la parte blanca.</li>
              <li>Separar los gajos; quitar membranas si hay paciencia.</li>
              <li>Congelarlos separados sobre una bandeja durante la noche.</li>
              <li>Licuar carne de coco con poca agua de coco y congelar aparte.</li>
            </ul>
          </article>

          <article>
            <span className="recipe-step-number">Juntos</span>
            <h3>La parte bonita</h3>
            <ul>
              <li>Licuar mandarina y coco congelados.</li>
              <li>Añadir 1–2 cucharadas de miel, sal y ralladura de lima.</li>
              <li>Agregar 2–4 cucharadas de crema de coco para textura de gelato.</li>
              <li>Probar, ajustar y congelar 1 hora suave o 2–3 horas firme.</li>
            </ul>
          </article>

          <article>
            <span className="recipe-step-number">Final</span>
            <h3>Hacerlo de aniversario</h3>
            <ul>
              <li>Servir en bowls fríos con gajos frescos.</li>
              <li>Rallar chocolate oscuro justo antes de servir.</li>
              <li>Sumar coco tostado, pistachos o almendras.</li>
              <li>Opcional: gajos de mandarina bañados a medias en chocolate.</li>
            </ul>
          </article>
        </div>

        <div className="recipe-buy">
          <strong>La compra que más cambia el resultado</strong>
          <span>Crema de coco, no leche de coco.</span>
        </div>
      </section>

      <section className="mandarin-final">
        <AnniversaryCat kind="orange" label="Mandarino celebrando" />
        <p>Una mandarina congelada a la vez</p>
        <h2>Gracias por un mes más vida mía 🤗💓</h2>
        <button className="primary-button max-w-sm" type="button" onClick={onClose}>
          Entrar a Alba
        </button>
      </section>
    </div>
  );
}

function AnniversaryCat({ kind, label }: { kind: "orange" | "black" | "siamese"; label: string }) {
  return (
    <svg className={`anniversary-cat ${kind}`} viewBox="0 0 180 180" role="img" aria-label={label}>
      <path className="cat-tail" d="M137 122c34 2 37-34 13-38-18-3-19 17-7 22" fill="none" strokeWidth="13" strokeLinecap="round" />
      <ellipse className="cat-body" cx="92" cy="120" rx="50" ry="43" />
      <path className="cat-head" d="M48 71 42 29l30 19a58 58 0 0 1 39 0l29-19-6 43c5 10 7 20 5 31-4 25-25 40-50 39-25 0-45-16-48-40-2-11 1-22 7-31Z" />
      {kind === "siamese" ? <path className="cat-mask" d="M68 67c13-13 39-13 51 0 10 11 10 34-1 48-12 15-37 15-49 0-11-14-11-37-1-48Z" /> : null}
      {kind === "orange" ? (
        <g className="cat-stripes" fill="none" strokeWidth="6" strokeLinecap="round">
          <path d="m72 48 5 15" />
          <path d="m92 43 1 17" />
          <path d="m113 49-5 14" />
          <path d="m53 83 16 4" />
          <path d="m130 83-15 4" />
        </g>
      ) : null}
      <ellipse className="cat-eye" cx="74" cy="89" rx="6" ry="8" />
      <ellipse className="cat-eye" cx="109" cy="89" rx="6" ry="8" />
      <path className="cat-nose" d="m87 105 5 4 5-4-5-4Z" />
      <path className="cat-smile" d="M92 109c-1 8-9 9-13 5m13-5c1 8 9 9 13 5" fill="none" strokeWidth="3" strokeLinecap="round" />
      <g className="cat-whiskers" fill="none" strokeWidth="2" strokeLinecap="round">
        <path d="M73 108 40 101" />
        <path d="M73 115 38 117" />
        <path d="m110 108 34-7" />
        <path d="m110 115 35 2" />
      </g>
    </svg>
  );
}

function AnniversaryNote({ onClose }: { onClose: () => void }) {
  return (
    <div className="anniversary-note-backdrop" role="dialog" aria-modal="true" aria-label="Nota de mesario">
      <AnniversaryConfetti />
      <section className="anniversary-note">
        <div className="note-cat-row">
          <AnniversaryCat kind="black" label="Gatito negro" />
          <AnniversaryCat kind="orange" label="Mandarino" />
          <AnniversaryCat kind="siamese" label="Gatito siamés" />
        </div>
        <p>14 meses</p>
        <h2>Gracias por un mes más vida mía 🤗💓</h2>
        <button className="primary-button" type="button" onClick={onClose}>Guardar en el corazón</button>
      </section>
    </div>
  );
}

function AnniversaryConfetti() {
  return (
    <div className="anniversary-confetti" aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => (
        <i key={index} style={{ "--i": index } as React.CSSProperties}>{index % 3 === 0 ? "♥" : index % 3 === 1 ? "✦" : "●"}</i>
      ))}
    </div>
  );
}

function AnniversaryDayDecor() {
  return (
    <div className="anniversary-day-decor" aria-hidden="true">
      {Array.from({ length: 14 }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties}>✦</i>)}
    </div>
  );
}

async function loadMappedDemoEntries(): Promise<CycleEntry[]> {
  const response = await fetch("/sample-data/alba-demo.json");
  const imported = parseImport(await response.text()).slice(-90);
  if (imported.length === 0) return [];

  const firstDate = parseISO(imported[0].date);
  const targetStart = addDays(new Date(), -(imported.length - 1));

  return imported.map((entry) => {
    const offset = differenceInCalendarDays(parseISO(entry.date), firstDate);
    const date = isoDate(addDays(targetStart, offset));
    const timestamp = `${date}T12:00:00.000Z`;

    return {
      ...entry,
      date,
      temperatureReadings: entry.temperatureReadings.map((reading) => ({
        ...reading,
        id: reading.id.startsWith("demo-") ? `demo-${date}-${reading.id.split("-").at(-1) ?? "temp"}` : `demo-${date}-${reading.id}`,
      })),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}

function upsertEntry(entries: CycleEntry[], nextEntry: CycleEntry): CycleEntry[] {
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  byDate.set(nextEntry.date, nextEntry);
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function safeSessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // The intro still closes even if browser storage is unavailable.
  }
}

function safeLocalGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Demo autoload is best-effort only.
  }
}

function BrandLab({
  theme,
  onToggleTheme,
}: {
  theme: "light" | "dark";
  onToggleTheme: (event: React.MouseEvent) => void;
}) {
  const alternatives = [
    {
      name: "Serif suave",
      className: "brand-word brand-font-serif",
      Icon: Sparkles,
      note: "Más romántica, cálida y editorial.",
    },
    {
      name: "Sans elegante",
      className: "brand-word brand-font-sans",
      Icon: Moon,
      note: "Más app moderna, limpia y confiable.",
    },
    {
      name: "Script discreta",
      className: "brand-word brand-font-script",
      Icon: Sun,
      note: "Más personal, como una nota escrita.",
    },
    {
      name: "Contraste alto",
      className: "brand-word brand-font-display",
      Icon: Sparkles,
      note: "Más memorable y de marca.",
    },
  ];

  return (
    <main className="min-h-screen bg-surface px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Brand lab</p>
            <h1 className="text-2xl font-semibold">Alba logo tests</h1>
          </div>
          <button className="secondary-button" type="button" onClick={onToggleTheme}>
            {theme === "dark" ? <Moon aria-hidden="true" size={17} /> : <Sun aria-hidden="true" size={17} />}
            Cambiar tema
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {alternatives.map(({ name, className, Icon, note }) => (
            <section className="brand-test-card" key={name}>
              <div className="brand-lockup brand-lockup-preview">
                <button className="brand-mark" type="button" onClick={onToggleTheme} aria-label="Cambiar tema">
                  <Icon aria-hidden="true" size={20} />
                </button>
                <span className={className}>Alba</span>
              </div>
              <div>
                <h2>{name}</h2>
                <p>{note}</p>
              </div>
            </section>
          ))}
        </div>

        <div className="mt-5 rounded border border-outline bg-surfaceVariant p-4 text-sm leading-6 text-ink/70">
          Para volver a la app usa <strong>/</strong>. Esta pantalla es solo para comparar dirección visual.
        </div>
      </div>
    </main>
  );
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return buffer;
}

