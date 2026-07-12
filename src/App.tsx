import { addDays, addMonths, differenceInCalendarDays, format, isSameMonth, parseISO, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarDays,
  Bell,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  Download,
  Eraser,
  FileUp,
  Flame,
  HeartPulse,
  Info,
  Loader2,
  MessageCircle,
  Minus,
  Moon,
  Plus,
  Sparkles,
  Sun,
  Thermometer,
  Trophy,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
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
import { calculateStats, getPeriodStarts, getRecentEntries } from "./lib/cycles";
import { calendarDaysForMonth, displayDate, isToday, isoDate } from "./lib/date";
import {
  cervixFirmnessOptions,
  cervixHeightOptions,
  cervixOpennessOptions,
  mucusOptions,
  optionLabel,
} from "./lib/observations";
import { buildPhaseMap, phaseMeta, type CyclePhase, type PhaseDay } from "./lib/phases";
import { applyRemoteDelete, applyRemoteEntry, bindDatasetToSubject, buildExport, clearEntries, deleteEntryForSync, getAllEntries, parseImport, replaceEntries, saveEntryForSync } from "./lib/storage";
import { acceptPartnerInvite, createPartnerInvite, getCurrentSession, getPartnerEmail, leaveCouple, removePartner, resendSignupConfirmation, resolveAccountContext, signInWithPassword, signOut, signUpWithPassword, type AlbaAccountContext } from "./lib/supabaseAuth";
import { deleteAllSupabaseEntries, flushPendingSupabaseMutations, isDemoEntry, isSupabaseConfigured, previewSyncWithSupabase, pullFromSupabase, savePushSubscription, subscribeToCycleEntryChanges, syncWithSupabase, testSupabaseConnection, type SupabaseSyncPreview } from "./lib/supabaseSync";
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
type AnniversaryCatKind = "orange" | "black" | "siamese" | "tuxedo";
type MascotPreviewModule = ComponentType<{
  AnniversaryCat: typeof AnniversaryCat;
  SideWalkingCat: typeof SideWalkingCat;
  CatPlayground: typeof CatPlayground;
  WanderingCat: typeof WanderingCat;
}>;
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
type CustomDateId = "may-photo-album" | "mandarino-monthiversary" | "first-kiss-monthiversary";
type ChatPlatform = "whatsapp" | "instagram";
type ChatMoment = {
  platform: ChatPlatform;
  sender: string;
  date: Date;
  text: string;
  mediaType?: "photo" | "audio" | "video" | "sticker" | "share" | "media";
};
type ChatWrappedStats = {
  isLoading: boolean;
  error: string;
  totalMessages: number;
  totalWords: number;
  kissWords: number;
  participants: Array<{ name: string; messages: number; emojis: Array<{ emoji: string; count: number }> }>;
  topWords: Array<{ word: string; count: number }>;
  topEmojis: Array<{ emoji: string; count: number }>;
  activeHours: Array<{ label: string; count: number; percent: number }>;
  activeWeekdays: Array<{ label: string; count: number; percent: number }>;
  activeMonths: Array<{ label: string; count: number }>;
  media: { photos: number; audio: number; videos: number; stickers: number; shares: number; other: number };
  firstDate?: string;
  lastDate?: string;
  sampleMoments: ChatMoment[];
};

const THEME_STORAGE_KEY = "alba-theme";
const TEMPERATURE_REMINDERS_KEY = "alba-temperature-reminders";
const TEMPERATURE_REMINDER_LAST_SHOWN_KEY = "alba-temperature-reminder-last-shown";
const CUSTOM_DATE_ACTIVATIONS_KEY = "alba-custom-date-activations";
const CUSTOM_DATE_DEVELOPMENTS: Array<{
  id: CustomDateId;
  title: string;
  description: string;
  trigger: string;
  status: "built" | "needs-build";
}> = [
  {
    id: "may-photo-album",
    title: "Álbum de mayo",
    description: "Primer evento especial: una experiencia sencilla basada en un álbum de fotos.",
    trigger: "Mayo, fecha exacta por confirmar",
    status: "needs-build",
  },
  {
    id: "mandarino-monthiversary",
    title: "Mesario Mandarino",
    description: "Gatitos, receta, nota y escena de siete vidas.",
    trigger: "Cada día 6",
    status: "built",
  },
  {
    id: "first-kiss-monthiversary",
    title: "15 meses del primer beso",
    description: "Infografías de mensajes con tema de besitos y una historia unificada.",
    trigger: "Cada día 7",
    status: "built",
  },
];
const CAT_KINDS: AnniversaryCatKind[] = ["black", "siamese", "orange", "tuxedo"];
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
  const isMascotPreview = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mascot-preview") === "1";
  const [MascotPreview, setMascotPreview] = useState<MascotPreviewModule | null>(null);
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
  const [importPreview, setImportPreview] = useState<{ fileName: string; entries: CycleEntry[] } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isTestingCloud, setIsTestingCloud] = useState(false);
  const [accountContext, setAccountContext] = useState<AlbaAccountContext | null>(null);
  const [authenticatedEmail, setAuthenticatedEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [createdInvite, setCreatedInvite] = useState<{ code: string; expiresAt: string } | null>(() => {
    try {
      const stored = safeLocalGet("alba-partner-invite");
      if (!stored) return null;
      const parsed = JSON.parse(stored) as { code: string; expiresAt: string };
      return new Date(parsed.expiresAt).getTime() > Date.now() ? parsed : null;
    } catch { return null; }
  });
  const [partnerEmail, setPartnerEmail] = useState<string | null>(null);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [inviteJustAccepted, setInviteJustAccepted] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authEmail, setAuthEmail] = useState("saritcarrillofuentes@gmail.com");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [liveSyncState, setLiveSyncState] = useState<"off" | "connecting" | "live" | "error">("off");
  const [isInitialCloudSyncSettling, setIsInitialCloudSyncSettling] = useState(() => isSupabaseConfigured());
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [pendingTemperature, setPendingTemperature] = useState(36.9);
  const [pendingTemperatureInput, setPendingTemperatureInput] = useState("36.9");
  const [pendingTemperatureSite, setPendingTemperatureSite] = useState<TemperatureSite>("oral");
  const [prioritizedEntryDate, setPrioritizedEntryDate] = useState<string | null>(null);
  const [lastTemperatureActionAt, setLastTemperatureActionAt] = useState(0);
  const [showDeleteDayConfirm, setShowDeleteDayConfirm] = useState(false);
  const [mapCycleOffset, setMapCycleOffset] = useState(0);
  const [mapSelectedDate, setMapSelectedDate] = useState<string | null>(() => isoDate(new Date()));
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
  const [customDateActivations, setCustomDateActivations] = useState<Record<CustomDateId, boolean>>(() => loadCustomDateActivations());
  const [wanderingKind, setWanderingKind] = useState<AnniversaryCatKind | null>(null);
  const [temperatureFlyer, setTemperatureFlyer] = useState<TemperatureFlyer | null>(null);
  const showBrandLab = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("brand-lab");
  const isMonthlyAnniversary = new Date().getDate() === 6;
  const [showAnniversaryIntro, setShowAnniversaryIntro] = useState(() => {
    const today = isoDate(new Date());
    return today === "2026-06-06" && safeSessionGet(`alba-anniversary-${today}`) !== "seen";
  });

  useEffect(() => {
    if (!isMascotPreview) return;
    void import("./MascotPreview").then((module) => setMascotPreview(() => module.default));
  }, [isMascotPreview]);
  const [showChatCelebration, setShowChatCelebration] = useState(() => {
    const today = isoDate(new Date());
    return new Date().getDate() === 7 && loadCustomDateActivations()["first-kiss-monthiversary"] && safeSessionGet(`alba-chat-celebration-${today}`) !== "seen";
  });
  const [showAnniversaryNote, setShowAnniversaryNote] = useState(false);
  const [anniversaryTapCount, setAnniversaryTapCount] = useState(0);
  const [anniversarySparkles, setAnniversarySparkles] = useState<AnniversarySparkle[]>([]);
  const importInput = useRef<HTMLInputElement>(null);
  const temperatureDisplayRef = useRef<HTMLLabelElement>(null);
  const savedTemperaturesRef = useRef<HTMLDivElement>(null);
  const lastCloudSyncAt = useRef(0);
  const cloudSyncRun = useRef<Promise<void> | null>(null);
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

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await getCurrentSession();
        if (!session) {
          if (active) setIsInitialCloudSyncSettling(false);
          return;
        }
        if (active) setAuthenticatedEmail(session.user.email ?? "");
        const context = await resolveAccountContext(session);
        await bindDatasetToSubject("legacy-local", context.subjectId);
        if (active) setAccountContext(context);
      } catch (error) {
        if (active) setStatus(error instanceof Error ? error.message : "No se pudo abrir la cuenta de Alba.");
      } finally {
        if (active) setIsAuthReady(true);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const storedEntries = await getAllEntries();
        if (safeLocalGet("alba-demo-mode") === "true") {
          const demoEntries = await loadMappedDemoEntries();
          setEntries(demoEntries);
          setPrioritizedEntryDate(shouldPrioritizeDate(selectedDate, demoEntries) ? selectedDate : null);
          setIsDemoMode(true);
          setIsInitialCloudSyncSettling(false);
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

        if (!isSupabaseConfigured()) setIsInitialCloudSyncSettling(false);
      } catch {
        setIsInitialCloudSyncSettling(false);
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
    if (!isAuthReady || !accountContext || isDemoMode) return;
    void syncCloudData({ quiet: true, initial: true });
  }, [isAuthReady, accountContext?.subjectId]);

  useEffect(() => {
    if (!accountContext) return;
    void getPartnerEmail().then(setPartnerEmail).catch(() => setPartnerEmail(null));
  }, [accountContext?.coupleId, accountContext?.role]);

  useEffect(() => {
    const revealItems = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      revealItems.forEach((item) => item.classList.add("is-revealed"));
      return;
    }

    const observer = new IntersectionObserver(
      (items) => {
        items.forEach((item) => {
          if (!item.isIntersecting) return;
          item.target.classList.add("is-revealed");
          observer.unobserve(item.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [activeTab, accountContext?.subjectId]);

  useEffect(() => {
    if (isDemoMode || !accountContext) return;

    const syncIfActive = () => {
      if (document.visibilityState === "hidden" || isSyncing) return;
      if (Date.now() - lastCloudSyncAt.current < 12000) return;
      void refreshCloudData();
    };

    const interval = window.setInterval(syncIfActive, 15000);
    window.addEventListener("focus", syncIfActive);
    window.addEventListener("online", syncIfActive);
    document.addEventListener("visibilitychange", syncIfActive);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncIfActive);
      window.removeEventListener("online", syncIfActive);
      document.removeEventListener("visibilitychange", syncIfActive);
    };
  }, [isDemoMode, isSyncing, accountContext?.subjectId]);

  useEffect(() => {
    if (isDemoMode || !accountContext) {
      setLiveSyncState("off");
      return;
    }

    setLiveSyncState("connecting");
    const unsubscribe = subscribeToCycleEntryChanges(
      (change) => {
        void (async () => {
          let changed = false;
          if ((change.eventType === "INSERT" || change.eventType === "UPDATE") && change.entry) {
            changed = await applyRemoteEntry(change.entry);
          } else if (change.eventType === "DELETE" && change.date) {
            changed = await applyRemoteDelete(change.date);
          }

          if (!changed) return;
          const storedEntries = await getAllEntries();
          setEntries(storedEntries);
          setStatus("Se recibió un cambio desde el otro dispositivo.");
        })().catch(() => setLiveSyncState("error"));
      },
      (nextStatus) => {
        if (nextStatus === "SUBSCRIBED") setLiveSyncState("live");
        else if (nextStatus === "CHANNEL_ERROR" || nextStatus === "TIMED_OUT") setLiveSyncState("error");
        else if (nextStatus === "CLOSED") setLiveSyncState("connecting");
      },
      accountContext,
    );

    return unsubscribe;
  }, [isDemoMode, accountContext?.subjectId]);

  const entryByDate = useMemo(() => new Map(entries.map((entry) => [entry.date, entry])), [entries]);
  const todayIso = isoDate(new Date());
  const stats = useMemo(() => calculateStats(entries, todayIso), [entries, todayIso]);
  const recentEntries = useMemo(() => getRecentEntries(entries, 92), [entries]);
  const phaseByDate = useMemo(() => buildPhaseMap(entries), [entries]);
  const selectedPhase = phaseByDate.get(selectedDate);
  const estimatedNextPeriod = useMemo(() => {
    if (stats.predictedNextPeriod) return stats.predictedNextPeriod;
    if (!stats.lastPeriodStart) return undefined;
    return isoDate(addDays(parseISO(stats.lastPeriodStart), Math.round(stats.averageCycleLength ?? 30)));
  }, [stats.averageCycleLength, stats.lastPeriodStart, stats.predictedNextPeriod]);
  const cycleWindows = useMemo(
    () => buildCycleWindows(entries, phaseByDate, Math.round(stats.averageCycleLength ?? 30)),
    [entries, phaseByDate, stats.averageCycleLength],
  );
  const activeCycleIndex = Math.max(0, cycleWindows.length - 1 + mapCycleOffset);
  const activeCycle = cycleWindows[activeCycleIndex];
  const mapSelectedDay = mapSelectedDate ? activeCycle?.days.find((day) => day.date === mapSelectedDate) : undefined;
  const mapSelectedEntry = mapSelectedDay ? entryByDate.get(mapSelectedDay.date) : undefined;
  const observationStreak = stats.observationStreak;
  const currentStreakNeedsToday = observationStreak.current > 0 && observationStreak.currentEndDate !== todayIso;
  const hasTemperatureToday = draft.temperatureReadings.length > 0;
  const shouldPrioritizeEntry = prioritizedEntryDate === selectedDate;
  const periodNeedsAttention = useMemo(() => shouldSurfacePeriod(entries, selectedDate, draft), [entries, selectedDate, draft]);
  const parsedPendingTemperature = parseTemperatureInput(pendingTemperatureInput);
  const registerTemperatureBlocked =
    parsedPendingTemperature === undefined ||
    Date.now() - lastTemperatureActionAt < 6000 ||
    hasSameMinuteTemperature(draft, parsedPendingTemperature, pendingTemperatureSite);

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
    safeLocalSet(CUSTOM_DATE_ACTIVATIONS_KEY, JSON.stringify(customDateActivations));
  }, [customDateActivations]);

  useEffect(() => {
    if (!customDateActivations["mandarino-monthiversary"] || customDateActivations["first-kiss-monthiversary"] || new Date().getDate() !== 6) return;
    const today = isoDate(new Date());
    const promptKey = `alba-custom-date-mandarino-${today}`;
    if (safeSessionGet(promptKey) === "prompted") return;
    safeSessionSet(promptKey, "prompted");
    setShowAnniversaryIntro(true);
  }, [customDateActivations]);

  useEffect(() => {
    if (showChatCelebration) setShowAnniversaryIntro(false);
  }, [showChatCelebration]);

  useEffect(() => {
    setWanderingKind(null);
    const timeout = window.setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * CAT_KINDS.length);
      setWanderingKind(CAT_KINDS[randomIndex] ?? "orange");
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [activeTab]);

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
    if (activeTab !== "map") return;
    const timeout = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(".cycle-map-panel");
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - 40;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [activeTab]);

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

    await saveEntryForSync(normalized);
    const storedEntries = await getAllEntries();
    setEntries(storedEntries);
    setSaveState("saved");
    if (!options?.quiet) setStatus(`Registro de ${displayDate(normalized.date)} guardado.`);
    if (accountContext) {
      try {
        await flushPendingSupabaseMutations(accountContext);
      } catch {
        setStatus("Guardado en este dispositivo; no se pudo sincronizar con la nube.");
      }
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
    await deleteEntryForSync(selectedDate);
    if (accountContext) {
      try {
        await flushPendingSupabaseMutations(accountContext);
      } catch {
        setStatus("Eliminado en este dispositivo; la nube se actualizará al recuperar conexión.");
      }
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
      if (accountContext) {
        await deleteAllSupabaseEntries(accountContext);
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

    if (!accountContext) {
      setStatus("Inicia sesión para sincronizar con la cuenta migrada.");
      return;
    }

    setIsPreparingSyncPreview(true);
    try {
      const sourceEntries = (await getAllEntries()).filter((entry) => !isDemoEntry(entry));
      const preview = await previewSyncWithSupabase(sourceEntries, accountContext);
      setSyncPreview(preview);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo preparar el resumen de sync.");
    } finally {
      setIsPreparingSyncPreview(false);
    }
  }

  async function syncCloudData(options?: { quiet?: boolean; entriesOverride?: CycleEntry[]; initial?: boolean }) {
    if (cloudSyncRun.current) return cloudSyncRun.current;

    const run = performCloudSync(options, true);
    cloudSyncRun.current = run;
    try {
      await run;
    } finally {
      if (cloudSyncRun.current === run) cloudSyncRun.current = null;
    }
  }

  async function refreshCloudData() {
    if (cloudSyncRun.current) return cloudSyncRun.current;
    const run = performCloudSync({ quiet: true }, false);
    cloudSyncRun.current = run;
    try {
      await run;
    } finally {
      if (cloudSyncRun.current === run) cloudSyncRun.current = null;
    }
  }

  async function performCloudSync(options: { quiet?: boolean; entriesOverride?: CycleEntry[]; initial?: boolean } | undefined, shouldPushMergedEntries: boolean) {
    if (isDemoMode) {
      if (options?.initial) setIsInitialCloudSyncSettling(false);
      if (!options?.quiet) setStatus("El modo demo no se sincroniza. Sal del demo para probar la nube con datos reales.");
      return;
    }

    if (!accountContext) {
      if (options?.initial) setIsInitialCloudSyncSettling(false);
      if (!options?.quiet) setStatus("Inicia sesión para sincronizar con la cuenta migrada.");
      return;
    }

    setIsSyncing(true);
    lastCloudSyncAt.current = Date.now();
    try {
      await flushPendingSupabaseMutations(accountContext);
      const sourceEntries = (options?.entriesOverride ?? (await getAllEntries())).filter((entry) => !isDemoEntry(entry));
      const mergedEntries = shouldPushMergedEntries
        ? await syncWithSupabase(sourceEntries, accountContext)
        : await pullFromSupabase(sourceEntries, accountContext);
      await replaceEntries(mergedEntries);
      setEntries(await getAllEntries());
      setSyncPreview(null);
      if (!options?.quiet) setStatus("Datos sincronizados con la nube.");
    } catch (error) {
      if (!options?.quiet) setStatus(error instanceof Error ? error.message : "No se pudo sincronizar.");
    } finally {
      setIsSyncing(false);
      if (options?.initial) setIsInitialCloudSyncSettling(false);
    }
  }

  async function testCloudConnection() {
    if (!accountContext) {
      setStatus("Inicia sesión para probar el acceso autenticado.");
      return;
    }

    setIsTestingCloud(true);
    try {
      await testSupabaseConnection(accountContext);
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
      setImportPreview({ fileName: file.name, entries: imported });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo importar el archivo.");
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  }

  async function logInToAlba(event: React.FormEvent) {
    event.preventDefault();
    if (!authEmail.trim() || !authPassword) return;
    setIsAuthenticating(true);
    try {
      const session = authMode === "register"
        ? await signUpWithPassword(authEmail, authPassword)
        : await signInWithPassword(authEmail, authPassword);
      if (!session) {
        setStatus("Revisa tu correo para confirmar la cuenta y luego inicia sesión.");
        setAuthMode("login");
        return;
      }
      setAuthenticatedEmail(session.user.email ?? "");
      const context = await resolveAccountContext(session);
      await bindDatasetToSubject("legacy-local", context.subjectId);
      setAccountContext(context);
      setAuthenticatedEmail(session.user.email ?? "");
      setAuthPassword("");
      setStatus(`Sesión iniciada como ${context.email}. Tus datos locales siguen intactos.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo iniciar sesión.");
    } finally {
      setIsAuthenticating(false);
      setIsAuthReady(true);
    }
  }

  async function logOutOfAlba() {
    setIsAuthenticating(true);
    try {
      await signOut();
      setAccountContext(null);
      setAuthenticatedEmail("");
      setLiveSyncState("off");
      setStatus("Sesión cerrada. Los datos locales permanecen en este dispositivo.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo cerrar sesión.");
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function joinWithInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!inviteCode.trim()) return;
    setIsAuthenticating(true);
    try {
      await acceptPartnerInvite(inviteCode);
      const session = await getCurrentSession();
      if (!session) throw new Error("La sesión expiró. Inicia sesión de nuevo.");
      const context = await resolveAccountContext(session);
      await bindDatasetToSubject("legacy-local", context.subjectId);
      setAccountContext(context);
      setInviteCode("");
      setInviteJustAccepted(true);
      setStatus("Invitación aceptada. Ya tienes acceso como pareja.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo aceptar la invitación.");
    } finally { setIsAuthenticating(false); }
  }

  async function generatePartnerInvite() {
    setIsAuthenticating(true);
    setIsGeneratingInvite(true);
    try {
      const [invite] = await Promise.all([
        createPartnerInvite(),
        new Promise((resolve) => window.setTimeout(resolve, 1200)),
      ]);
      setCreatedInvite(invite);
      safeLocalSet("alba-partner-invite", JSON.stringify(invite));
      setStatus("Invitación creada. Compártela de forma privada.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo crear la invitación.");
    } finally { setIsAuthenticating(false); setIsGeneratingInvite(false); }
  }

  async function endRelationship(asOwner: boolean) {
    const message = asOwner ? "¿Retirar a tu pareja? Perderá acceso a estos registros." : "¿Salir de esta pareja? Perderás acceso a los registros compartidos.";
    if (!window.confirm(message)) return;
    setIsAuthenticating(true);
    try {
      if (asOwner) await removePartner(); else await leaveCouple();
      if (asOwner) {
        setPartnerEmail(null);
        setCreatedInvite(null);
        safeLocalSet("alba-partner-invite", "");
        setStatus("La pareja fue retirada. Puedes crear una nueva invitación cuando quieras.");
      } else {
        setAccountContext(null);
        setStatus("Saliste de la pareja correctamente.");
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : "No se pudo actualizar la pareja."); }
    finally { setIsAuthenticating(false); }
  }

  async function resendConfirmation() {
    setIsAuthenticating(true);
    try {
      await resendSignupConfirmation(authEmail);
      setStatus("Enviamos un enlace nuevo. Usa el más reciente y descarta el que apunta a localhost.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo reenviar la confirmación.");
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function confirmImportData() {
    if (!importPreview) return;
    setIsImporting(true);
    try {
      safeLocalSet("alba-demo-mode", "false");
      setIsDemoMode(false);
      await replaceEntries(importPreview.entries);
      const restoredEntries = await getAllEntries();
      setEntries(restoredEntries);
      setImportPreview(null);
      setStatus(`Importados ${restoredEntries.length} registros; los cambios locales pendientes fueron preservados.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo importar el archivo.");
    } finally {
      setIsImporting(false);
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

  function closeChatCelebration() {
    safeSessionSet(`alba-chat-celebration-${isoDate(new Date())}`, "seen");
    setShowChatCelebration(false);
  }

  function toggleCustomDateActivation(id: CustomDateId) {
    setCustomDateActivations((current) => ({ ...current, [id]: !current[id] }));
  }

  function replayCustomDate(id: CustomDateId) {
    if (id === "mandarino-monthiversary") {
      setShowAnniversaryIntro(true);
      return;
    }
    if (id === "first-kiss-monthiversary") {
      setShowChatCelebration(true);
    }
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

  if (isMascotPreview) {
    return MascotPreview ? (
      <MascotPreview AnniversaryCat={AnniversaryCat} SideWalkingCat={SideWalkingCat} CatPlayground={CatPlayground} WanderingCat={WanderingCat} />
    ) : <main className="mascot-preview-loading">Preparando la patrulla…</main>;
  }

  if (showBrandLab) {
    return <BrandLab theme={theme} onToggleTheme={toggleTheme} />;
  }

  if (isAuthReady && !accountContext) {
    return (
      <main className="auth-shell min-h-screen px-4 py-10 text-ink">
        <section className="auth-card mx-auto max-w-md">
          <div className="auth-brand" aria-label="Alba">
            <span className="auth-brand-mark">A</span>
            <div><strong>Alba</strong><small>Tu espacio privado</small></div>
          </div>
          <div className="auth-heading">
            <p className="eyebrow">Cuidado, claridad y compañía</p>
            <h1>{authenticatedEmail ? "Únete a tu pareja" : authMode === "register" ? "Crea tu cuenta de Alba" : "Bienvenida de vuelta"}</h1>
            <p>{authenticatedEmail ? `Sesión iniciada como ${authenticatedEmail}. Introduce la invitación de la dueña del ciclo.` : authMode === "register" ? "Esta cuenta protegerá tus registros y los vinculará contigo." : "Entra para ver tus registros privados."}</p>
          </div>
          {authenticatedEmail ? <form className="auth-form" onSubmit={joinWithInvite}><label>Código de invitación<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="Ej. A1B2C3D4E5F6" autoCapitalize="characters" /></label><button className="primary-button" type="submit" disabled={isAuthenticating || !inviteCode.trim()}>Unirme como pareja</button><button className="auth-link" type="button" onClick={logOutOfAlba}>Usar otra cuenta</button></form> : <>
          <div className="auth-tabs" role="tablist" aria-label="Acceso a Alba">
            <button className={authMode === "register" ? "active" : ""} type="button" onClick={() => setAuthMode("register")}>Crear cuenta</button>
            <button className={authMode === "login" ? "active" : ""} type="button" onClick={() => setAuthMode("login")}>Iniciar sesión</button>
          </div>
          <form className="auth-form" onSubmit={logInToAlba}>
            <label>Correo<input type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="tu@email.com" /></label>
            <label>Contraseña<input type="password" minLength={8} autoComplete={authMode === "register" ? "new-password" : "current-password"} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Mínimo 8 caracteres" /></label>
            <button className="primary-button" type="submit" disabled={isAuthenticating || authPassword.length < 8}>{isAuthenticating ? "Procesando..." : authMode === "register" ? "Registrarme" : "Entrar"}</button>
          </form>
          {authMode === "login" ? <button className="auth-link" type="button" onClick={resendConfirmation} disabled={isAuthenticating || !authEmail}>¿No llegó la confirmación? Reenviar correo</button> : null}
          {status ? <div className="info-box">{status}</div> : null}
          <div className="auth-trust"><span>✓</span><p><strong>Tus datos siguen siendo tuyos.</strong> Cerrar sesión oculta la información sin borrar la copia local segura.</p></div>
          </>}
        </section>
      </main>
    );
  }

  return (
    <main className={isMonthlyAnniversary ? "anniversary-day min-h-screen overflow-x-hidden bg-surface text-ink" : "min-h-screen overflow-x-hidden bg-surface text-ink"} onPointerMove={addAnniversarySparkle}>
      {inviteJustAccepted ? <div className="relationship-success" role="status"><span>♡</span><div><strong>¡Ya están conectados!</strong><p>La invitación se usó correctamente y los registros compartidos ya están disponibles.</p></div><button type="button" onClick={() => setInviteJustAccepted(false)} aria-label="Cerrar">×</button></div> : null}
      {showChatCelebration ? <ChatCelebration onClose={closeChatCelebration} /> : null}
      {!showChatCelebration && showAnniversaryIntro ? <AnniversaryIntro onClose={closeAnniversaryIntro} /> : null}
      {isMonthlyAnniversary ? <AnniversaryDayDecor activeTab={activeTab} /> : null}
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
      {importPreview ? renderImportPreviewModal() : null}
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
        <CatPlayground activeTab={activeTab} missingKind={wanderingKind ?? undefined} />
        <div className="tab-scene" key={activeTab}>
          {activeTab === "today" ? renderToday() : null}
          {activeTab === "calendar" ? renderCalendar() : null}
          {activeTab === "chart" ? renderChart() : null}
          {activeTab === "map" ? renderMap() : null}
          {activeTab === "ai" ? renderAi() : null}
          {activeTab === "settings" ? renderSettings() : null}
        </div>
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

  function renderImportPreviewModal() {
    if (!importPreview) return null;
    const sortedDates = importPreview.entries.map((entry) => entry.date).sort();
    const firstDate = sortedDates.at(0);
    const lastDate = sortedDates.at(-1);

    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="import-preview-title">
        <section className="modal-panel sync-preview-panel">
          <div>
            <p className="eyebrow">Restaurar respaldo</p>
            <h2 id="import-preview-title">Revisar antes de importar</h2>
            <p>
              Archivo: <strong>{importPreview.fileName}</strong>. Alba reemplazará los registros visibles de este dispositivo con el
              respaldo, pero conservará y volverá a aplicar cualquier cambio local que todavía esté pendiente de sincronización.
            </p>
          </div>

          <div className="sync-preview-grid">
            <SyncPreviewStat label="Registros actuales" value={entries.length} />
            <SyncPreviewStat label="Registros del respaldo" value={importPreview.entries.length} />
          </div>

          <div className="info-box">
            {firstDate && lastDate
              ? `El respaldo cubre desde ${displayDate(firstDate)} hasta ${displayDate(lastDate)}.`
              : "El respaldo no contiene registros."}{" "}
            Exporta una copia actual antes de confirmar si quieres conservar un punto de retorno manual.
          </div>

          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={() => setImportPreview(null)} disabled={isImporting}>
              Cancelar
            </button>
            <button className="primary-button" type="button" onClick={confirmImportData} disabled={isImporting}>
              {isImporting ? "Importando..." : "Confirmar importación"}
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
          <div className="streak-card" aria-label="Rachas de observaciones">
            <div className="streak-main">
              <span className="streak-icon" aria-hidden="true">
                <Flame size={21} />
              </span>
              <div>
                <span className="eyebrow">Racha actual</span>
                <strong>{observationStreak.current} {observationStreak.current === 1 ? "día" : "días"}</strong>
              </div>
            </div>
            <p>
              {observationStreak.current === 0
                ? "Empieza con una temperatura, periodo, señal cervical o nota de hoy."
                : currentStreakNeedsToday
                  ? "Añade una observación hoy para mantenerla viva."
                  : "Hoy ya suma: cada señal pequeña ayuda a leer mejor el ciclo."}
            </p>
            <div className="streak-best">
              <Trophy size={16} aria-hidden="true" />
              <span>Mejor racha</span>
              <strong>{observationStreak.longest} {observationStreak.longest === 1 ? "día" : "días"}</strong>
            </div>
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
    const canViewOlder = activeCycleIndex > 0;
    const canViewNewer = activeCycleIndex < cycleWindows.length - 1;
    const shouldWaitForInitialSync = isInitialCloudSyncSettling && !isDemoMode;
    const selectedMeta = mapSelectedDay ? phaseMeta[mapSelectedDay.phase] : phaseMeta.follicular;
    const cervixObservations = mapSelectedEntry
      ? [
          mapSelectedEntry.cervixHeight ? optionLabel(cervixHeightOptions, mapSelectedEntry.cervixHeight) : null,
          mapSelectedEntry.cervixFirmness ? optionLabel(cervixFirmnessOptions, mapSelectedEntry.cervixFirmness) : null,
          mapSelectedEntry.cervixOpenness ? optionLabel(cervixOpennessOptions, mapSelectedEntry.cervixOpenness) : null,
        ].filter((value): value is string => Boolean(value))
      : [];

    function moveCycle(direction: -1 | 1) {
      const nextIndex = activeCycleIndex + direction;
      const nextCycle = cycleWindows[nextIndex];
      if (!nextCycle) return;
      setMapCycleOffset(nextIndex - (cycleWindows.length - 1));
      setMapSelectedDate(nextCycle.isCurrent ? nextCycle.days.find((day) => day.isToday)?.date ?? null : null);
    }

    return (
      <div className="cycle-map-layout">
        <Panel className="cycle-map-panel">
          <header className="cycle-map-header">
            <button className="icon-button compact" type="button" onClick={() => moveCycle(-1)} disabled={!canViewOlder} aria-label="Ver ciclo anterior" title="Ciclo anterior">
              <ChevronLeft aria-hidden="true" size={18} />
            </button>
            <div>
              <p>{activeCycle?.isCurrent ? "Ciclo actual" : "Ciclo anterior"}</p>
              <h2>{activeCycle ? `${displayDate(activeCycle.start, "d MMM")} - ${displayDate(activeCycle.end, "d MMM")}` : "Aún sin ciclo"}</h2>
            </div>
            <button className="icon-button compact" type="button" onClick={() => moveCycle(1)} disabled={!canViewNewer} aria-label="Ver ciclo siguiente" title="Ciclo siguiente">
              <ChevronRight aria-hidden="true" size={18} />
            </button>
          </header>

          {shouldWaitForInitialSync ? (
            <EmptyState text="Sincronizando los datos recientes antes de dibujar el ciclo." />
          ) : activeCycle ? (
            <CycleWheel
              cycle={activeCycle}
              selectedDate={mapSelectedDay?.date}
              onSelectDate={setMapSelectedDate}
            />
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
      <Panel className="settings-panel">
        <div className="settings-hero">
          <div className="settings-hero-icon"><Database aria-hidden="true" size={22} /></div>
          <div><span className="eyebrow">Tu espacio</span><h2>Ajustes</h2><p>Cuenta, privacidad, recordatorios y experiencias de Alba.</p></div>
        </div>
        <section className="settings-section account-section">
          <div className="settings-section-heading"><div><span className="eyebrow">Identidad</span><h3>Cuenta Alba</h3></div><span className="settings-status-dot">Protegida</span></div>
          {accountContext ? (
            <div className="account-summary">
              <div className="account-avatar">{accountContext.subjectName.slice(0, 1).toUpperCase()}</div>
              <div className="account-copy">
                <strong>{accountContext.subjectName}</strong><span>{accountContext.email}</span>
                <small>Sincronización privada activa</small>
              </div>
              <button className="secondary-button compact-action" type="button" onClick={logOutOfAlba} disabled={isAuthenticating}>Cerrar sesión</button>
            </div>
          ) : (
            <form className="mt-2 grid gap-3" onSubmit={logInToAlba}>
              <label className="grid gap-1 text-sm">
                Correo
                <input className="rounded border border-outline bg-surface px-3 py-2" type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} />
              </label>
              <label className="grid gap-1 text-sm">
                Contraseña
                <input className="rounded border border-outline bg-surface px-3 py-2" type="password" autoComplete="current-password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} />
              </label>
              <button className="primary-button" type="submit" disabled={!isAuthReady || isAuthenticating || !authPassword}>
                {isAuthenticating ? "Entrando..." : "Iniciar sesión"}
              </button>
              <p className="text-xs text-ink/60">Iniciar o cerrar sesión nunca borra IndexedDB.</p>
            </form>
          )}
          {accountContext?.role === "owner" ? (
            <div className="invite-card">
              <div><strong>{partnerEmail ? "Tu pareja" : "Invitar a tu pareja"}</strong><p>{partnerEmail ? `${partnerEmail} tiene acceso a los registros compartidos.` : "Crea un código privado, válido durante 7 días y para un solo uso."}</p></div>
              {partnerEmail ? <button className="secondary-button danger" type="button" onClick={() => endRelationship(true)} disabled={isAuthenticating}>Retirar acceso de pareja</button> : <button className="secondary-button" type="button" onClick={generatePartnerInvite} disabled={isAuthenticating}>{isGeneratingInvite ? "Preparando algo especial…" : "Crear invitación"}</button>}
              {isGeneratingInvite ? <div className="invite-code generating" aria-live="polite"><code>✦ ✦ ✦ ✦ ✦ ✦</code><small>Barajando tu código…</small></div> : createdInvite && !partnerEmail ? <div className="invite-code revealed"><code>{createdInvite.code}</code><small>Vence: {new Date(createdInvite.expiresAt).toLocaleString("es")}</small></div> : null}
            </div>
          ) : accountContext ? <div className="invite-card"><strong>Conectado con {accountContext.subjectName}</strong><p>{partnerEmail ? `Compartes este espacio con ${partnerEmail}.` : "Tu acceso de pareja está activo."} No necesitas la contraseña de la dueña.</p><button className="secondary-button danger" type="button" onClick={() => endRelationship(false)} disabled={isAuthenticating}>Salir de esta pareja</button></div> : null}
        </section>
        <section className="settings-section">
          <div className="settings-section-heading"><div><span className="eyebrow">Privacidad y respaldo</span><h3>Tus datos</h3></div></div>
          <p className="settings-section-copy">Exporta una copia, restaura un respaldo o revisa la sincronización.</p>
        <div className="settings-action-grid">
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
        </section>
        <section className="settings-section">
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
        </section>
        <section className="settings-section experience-section">
          <div className="settings-section-heading"><div><span className="eyebrow">Momentos compartidos</span><h3>Experiencias</h3></div></div>
        <div className="anniversary-countdown mt-3">
          <span>Próximo mesario</span>
          <strong>{daysUntilNextMonthiversary()} días</strong>
          <small>El 6 vuelve Mandarino.</small>
        </div>
        <div className="custom-date-list mt-3">
          <div>
            <span className="eyebrow">Fechas especiales</span>
            <h3>Experiencias guardadas</h3>
          </div>
          {CUSTOM_DATE_DEVELOPMENTS.map((item) => (
            <article key={item.id} className="custom-date-card">
              <div>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
                <small>{item.trigger}</small>
              </div>
              <div className="custom-date-actions">
                {item.status === "built" ? (
                  <>
                    <button className="secondary-button compact-action" type="button" onClick={() => replayCustomDate(item.id)}>
                      Reabrir
                    </button>
                    <button
                      className={customDateActivations[item.id] ? "secondary-button compact-action active-demo" : "secondary-button compact-action"}
                      type="button"
                      onClick={() => toggleCustomDateActivation(item.id)}
                    >
                      {customDateActivations[item.id] ? "Activa" : "Activar"}
                    </button>
                  </>
                ) : (
                  <span className="custom-date-pill">Por armar</span>
                )}
              </div>
            </article>
          ))}
        </div>
        </section>
        <section className="settings-section avatar-section">
        <div className="avatar-setup-card mt-3">
          <div>
            <span className="eyebrow">Avatares</span>
            <h3>Vista de paseo</h3>
            <p>La configuración de avatares también usará esta silueta lateral para previsualizar caminata, accesorios y sonidos.</p>
          </div>
          <div className="avatar-setup-preview" aria-label="Vista lateral de los avatares">
            {CAT_KINDS.map((kind) => (
              <SideWalkingCat key={kind} kind={kind} label={`Vista lateral ${kind}`} className="avatar-setup-cat" />
            ))}
          </div>
        </div>
        </section>
        <div className="info-box mt-3">
          Sync de ciclo: <strong>{accountContext ? `cuenta de ${accountContext.subjectName}` : "requiere iniciar sesión"}</strong>. Actualización automática: <strong>cada 15 s</strong>. Canal Realtime:{" "}
          <strong>{liveSyncState === "live" ? "conectado" : liveSyncState === "connecting" ? "conectando" : liveSyncState === "error" ? "requiere configuración" : "apagado"}</strong>.
          Los datos demo son solo para explorar y nunca se suben.
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

interface CycleWheelDay extends PhaseDay {
  isFuture: boolean;
  isToday: boolean;
}

interface CycleWindow {
  start: string;
  end: string;
  isCurrent: boolean;
  days: CycleWheelDay[];
}

function buildCycleWindows(entries: CycleEntry[], phaseByDate: Map<string, PhaseDay>, averageCycleLength: number): CycleWindow[] {
  const today = isoDate(new Date());
  const starts = getPeriodStarts([...entries].sort((a, b) => a.date.localeCompare(b.date))).filter((start) => start <= today);
  const safeCycleLength = Math.min(45, Math.max(21, averageCycleLength));

  return starts.map((start, index) => {
    const nextStart = starts[index + 1];
    const predictedEnd = isoDate(addDays(parseISO(start), safeCycleLength - 1));
    const end = nextStart
      ? isoDate(addDays(parseISO(nextStart), -1))
      : today > predictedEnd
        ? today
        : predictedEnd;
    const days: CycleWheelDay[] = [];

    for (let cursor = parseISO(start); cursor <= parseISO(end); cursor = addDays(cursor, 1)) {
      const date = isoDate(cursor);
      const cycleDay = differenceInCalendarDays(cursor, parseISO(start)) + 1;
      const known = phaseByDate.get(date);
      const fallbackPhase = fallbackCyclePhase(cycleDay, safeCycleLength);
      const meta = phaseMeta[fallbackPhase];
      days.push({
        date,
        cycleDay,
        phase: known?.phase ?? fallbackPhase,
        label: known?.label ?? meta.label,
        confidence: known?.confidence ?? "baja",
        description: known?.description ?? phaseExplanation(fallbackPhase),
        isFuture: date > today,
        isToday: date === today,
      });
    }

    return { start, end, days, isCurrent: index === starts.length - 1 };
  });
}

function fallbackCyclePhase(cycleDay: number, cycleLength: number): CyclePhase {
  const ovulationDay = Math.max(12, cycleLength - 14);
  if (cycleDay <= 5) return "period";
  if (cycleDay >= ovulationDay - 5 && cycleDay < ovulationDay) return "fertile";
  if (cycleDay === ovulationDay) return "possible-ovulation";
  if (cycleDay > ovulationDay) return "luteal";
  return "follicular";
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
  return <section data-reveal className={`panel motion-reveal rounded border border-outline bg-surface p-4 shadow-soft sm:p-5 ${className}`}>{children}</section>;
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

function ChatCelebration({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<ChatWrappedStats>(() => emptyChatWrappedStats(true));

  useEffect(() => {
    let isCancelled = false;

    loadChatWrappedStats()
      .then((nextStats) => {
        if (!isCancelled) setStats(nextStats);
      })
      .catch((error) => {
        if (!isCancelled) {
          setStats({ ...emptyChatWrappedStats(false), error: error instanceof Error ? error.message : "No se pudo leer la historia." });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const peakHour = stats.activeHours.reduce((best, item) => (item.count > best.count ? item : best), { label: "-", count: 0, percent: 0 });
  const totalMedia = stats.media.photos + stats.media.audio + stats.media.videos + stats.media.stickers + stats.media.shares + stats.media.other;
  const topMonths = [...stats.activeMonths].sort((a, b) => b.count - a.count).slice(0, 4);

  return (
    <div className="chat-celebration-shell" role="dialog" aria-modal="true" aria-label="Resumen de mensajes de mesario">
      <div className="chat-liquid-bg" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="chat-phone-frame">
        <button className="chat-close-button" type="button" onClick={onClose}>
          Entrar a Alba
        </button>

        <section className="chat-hero-panel chat-glass-card">
          <span className="chat-kicker">7 de julio · 15 meses del primer beso</span>
          <h2>Quince meses desde ese primer besito</h2>
          <p>
            WhatsApp e Instagram se vuelven una cartita líquida: palabras, horarios, emojis y todas esas señales pequeñas que empezaron a crecer desde aquel beso.
          </p>
          <div className="chat-hero-stats">
            <strong>{stats.isLoading ? "..." : compactNumber(stats.totalMessages)}</strong>
            <span>mensajes encontrados</span>
          </div>
        </section>

        {stats.error ? (
          <section className="chat-glass-card chat-error-card">
            <strong>No pude leer los chats todavía.</strong>
            <span>{stats.error}</span>
          </section>
        ) : null}

        <section className="chat-stats-grid" aria-label="Resumen principal">
          {[
            { label: "Besitos", value: stats.isLoading ? "..." : compactNumber(stats.kissWords), detail: "veces que el chat se acercó" },
            { label: "Palabras", value: stats.isLoading ? "..." : compactNumber(stats.totalWords), detail: "lo que nos dijimos" },
            { label: "Multimedia", value: stats.isLoading ? "..." : compactNumber(totalMedia), detail: "recuerdos, reels, archivos y cositas" },
            { label: "Hora viva", value: stats.isLoading ? "..." : peakHour.label, detail: "cuando más nos buscamos" },
          ].map((item) => (
            <article className="chat-mini-card chat-glass-card" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
            </article>
          ))}
        </section>

        <section className="chat-glass-card chat-section-card">
          <div className="chat-section-heading">
            <MessageCircle aria-hidden="true" size={18} />
            <div>
              <span>Frecuencia</span>
              <h3>Horas con más ganas de besito</h3>
            </div>
          </div>
          <div className="chat-hour-chart" aria-label="Distribución de mensajes por hora">
            {stats.activeHours.map((hour) => (
              <span key={hour.label} style={{ "--bar-height": `${Math.max(8, hour.percent)}%` } as React.CSSProperties}>
                <i />
                <small>{hour.label}</small>
              </span>
            ))}
          </div>
        </section>

        <section className="chat-glass-card chat-section-card">
          <div className="chat-section-heading">
            <CalendarDays aria-hidden="true" size={18} />
            <div>
              <span>Ritmo semanal</span>
              <h3>Los días que más volvimos</h3>
            </div>
          </div>
          <div className="chat-week-bars">
            {stats.activeWeekdays.map((day) => (
              <div key={day.label}>
                <span>{day.label}</span>
                <strong style={{ width: `${Math.max(4, day.percent)}%` }} />
                <small>{day.count}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="chat-glass-card chat-section-card">
          <div className="chat-section-heading">
            <Sparkles aria-hidden="true" size={18} />
            <div>
              <span>Nube de besitos</span>
              <h3>Palabras que se acercan</h3>
            </div>
          </div>
          <div className="chat-word-cloud">
            {(stats.topWords.length ? stats.topWords : [{ word: "cargando", count: 1 }]).slice(0, 26).map((word, index) => (
              <span key={`${word.word}-${index}`} style={{ "--weight": Math.min(2.3, 0.88 + word.count / Math.max(1, stats.topWords[0]?.count ?? 1) * 1.45) } as React.CSSProperties}>
                {word.word}
              </span>
            ))}
          </div>
        </section>

        <section className="chat-glass-card chat-section-card">
          <div className="chat-section-heading">
            <HeartPulse aria-hidden="true" size={18} />
            <div>
              <span>Emojis</span>
              <h3>Caritas que también besan</h3>
            </div>
          </div>
          <div className="chat-emoji-grid">
            {stats.participants.map((participant) => (
              <article key={participant.name}>
                <strong>{shortParticipantName(participant.name)}</strong>
                <div>
                  {(participant.emojis.length ? participant.emojis : stats.topEmojis).slice(0, 6).map((emoji) => (
                    <span key={`${participant.name}-${emoji.emoji}`}>{emoji.emoji}<small>{emoji.count}</small></span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="chat-glass-card chat-section-card">
          <div className="chat-section-heading">
            <BarChart3 aria-hidden="true" size={18} />
            <div>
              <span>Línea de tiempo</span>
              <h3>Meses desde el primer beso</h3>
            </div>
          </div>
          <div className="chat-month-stack">
            {topMonths.map((month) => (
              <span key={month.label}>
                <strong>{month.label}</strong>
                <small>{compactNumber(month.count)} mensajes</small>
              </span>
            ))}
          </div>
          <p className="chat-date-range">{stats.firstDate && stats.lastDate ? `${stats.firstDate} -> ${stats.lastDate}` : "Leyendo la línea de tiempo..."}</p>
        </section>

        <section className="chat-glass-card chat-section-card">
          <div className="chat-section-heading">
            <Download aria-hidden="true" size={18} />
            <div>
              <span>Multimedia</span>
              <h3>Lo que guardó un poquito más</h3>
            </div>
          </div>
          <div className="chat-media-grid">
            <span><strong>{stats.media.photos}</strong><small>fotos</small></span>
            <span><strong>{stats.media.audio}</strong><small>audios</small></span>
            <span><strong>{stats.media.videos}</strong><small>videos</small></span>
            <span><strong>{stats.media.shares}</strong><small>reels y links</small></span>
            <span><strong>{stats.media.other}</strong><small>archivos</small></span>
          </div>
        </section>

        <section className="chat-final-panel chat-glass-card">
          <span>Resumen de hoy</span>
          <h3>Quince meses después, ese primer beso todavía sigue abriendo puertas.</h3>
          <p>De todos estos mensajes, lo más bonito es que todavía encuentro nuevas formas de acercarme a ti.</p>
          <button className="primary-button" type="button" onClick={onClose}>
            Guardar este besito
          </button>
        </section>
      </div>
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
        <div className="cat-family playful-scuffle" aria-label="Mandarino y sus amigos jugando">
          <AnniversaryCat kind="black" label="Gatito negro" />
          <AnniversaryCat kind="orange" label="Mandarino" />
          <AnniversaryCat kind="siamese" label="Gatita lynx point" />
        </div>
        <p>14 meses</p>
        <h2>Mandarino vino del futuro con una misión para hoy</h2>
        <span>Dice que en otra vida todavía te llamas bonita y seguimos preparando cosas juntos.</span>
        <a className="anniversary-scroll-cue" href="#anniversary-recipe">
          <span>Seguir a Mandarino</span>
          <strong aria-hidden="true">↓</strong>
        </a>
        <div className="mandarino-teleport-guide">
          <AnniversaryCat kind="orange" label="Mandarino viajando al futuro" />
        </div>
      </section>

      <section className="recipe-mission" id="anniversary-recipe">
        <div className="recipe-heading">
          <p>Para hacer juntos</p>
          <h2>Nuestro postre helado de mandarina y coco</h2>
          <span>Mandarina bien fresca, coco cremoso y un poquito de chocolate oscuro para cerrar la noche.</span>
        </div>

        <div className="recipe-columns">
          <article>
            <div className="recipe-cat recipe-cat-highlight"><AnniversaryCat kind="tuxedo" label="Gatito esmoquin vigilando las mandarinas" /></div>
            <span className="recipe-step-number">Hoy bien tempranito</span>
            <h3>Yo preparo algunos ingredientes</h3>
            <ul>
              <li>Voy a pelar entre 8 y 12 mandarinas como sabes que me gusta 🤭</li>
              <li>Ya partí mi coquito ayer para la salida al cine y saqué toda la pulpa 🥥🤗</li>
              <li>Voy a congelar todos los gajos junto con la pulpa del coco 😋🥶</li>
            </ul>
          </article>

          <article>
            <div className="recipe-cat"><AnniversaryCat kind="orange" label="Mandarino ayudando a cocinar" /></div>
            <span className="recipe-step-number">Cuando estemos juntitos</span>
            <h3>Lo preparamos entre los dos</h3>
            <ul>
              <li>Ponemos en la licuadora la mandarina y el coco congelados 😊</li>
              <li>Le aumentamos miel, una pizquita de sal y limoncito 🍯🧂🍋</li>
              <li>Leche o crema de coco a gusto para espesar 😚</li>
            </ul>
          </article>

          <article>
            <div className="recipe-cat recipe-cat-pair">
              <AnniversaryCat kind="black" label="Gatito negro esperando el postre" />
              <AnniversaryCat kind="siamese" label="Gatita lynx point esperando el postre" />
            </div>
            <span className="recipe-step-number">Cuando sirvamos</span>
            <h3>El toque de mesario perfecto</h3>
            <ul>
              <li>Poner gajos de mandarina recién peladitos 😋🍊</li>
              <li>Rallar chocolate encima para más placer 🍫</li>
              <li>Coquito rallado si nos apetece 😊</li>
            </ul>
          </article>
        </div>

        <div className="recipe-buy">
          <strong>Si te apetece ponerle algún ingrediente no dudes en decirme 🤗✨</strong>
          <span>Podemos probar crema de coco, pistachitos, almendras, coco tostado o una hojita de menta.</span>
        </div>
      </section>

      <section className="mandarin-final" id="anniversary-note">
        <div className="future-cat-couple" aria-label="Mandarino y su gatito esmoquin">
          <AnniversaryCat kind="orange" label="Mandarino en otra vida" />
          <span aria-hidden="true">💕✨💕</span>
          <AnniversaryCat kind="tuxedo" label="Yo como gatito esmoquin" />
        </div>
        <p>En esta vida y en todas las que vengan</p>
        <h2>Te voy a amar y siempre voy a encontrarte, vida mia 🤗💓</h2>
        <span className="future-note">Aunque tenga que buscar a una gatita naranja llamada Mandarino por el resto de mis siete vidas</span>
        <button className="primary-button max-w-sm" type="button" onClick={onClose}>
          Entrar a Alba
        </button>
      </section>
    </div>
  );
}

function AnniversaryCat({
  kind,
  label,
  className = "",
  onReaction,
}: {
  kind: AnniversaryCatKind;
  label: string;
  className?: string;
  onReaction?: (reaction: "meow" | "purr") => void;
}) {
  const [reaction, setReaction] = useState<"meow" | "purr" | null>(null);
  const tapTimer = useRef<number | null>(null);

  function reactToTap(event: React.MouseEvent<SVGSVGElement>) {
    if (event.detail > 1) {
      if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
      tapTimer.current = null;
      triggerCatReaction("purr");
      return;
    }

    tapTimer.current = window.setTimeout(() => {
      triggerCatReaction("meow");
      tapTimer.current = null;
    }, 240);
  }

  function triggerCatReaction(nextReaction: "meow" | "purr") {
    setReaction(nextReaction);
    playCatAudio(kind, nextReaction);
    onReaction?.(nextReaction);
    window.setTimeout(() => setReaction((current) => (current === nextReaction ? null : current)), nextReaction === "purr" ? 1300 : 900);
  }

  return (
    <svg
      className={`anniversary-cat ${kind} ${className}${reaction ? ` ${reaction}` : ""}`}
      viewBox="0 0 180 180"
      role="button"
      tabIndex={0}
      aria-label={`${label}. Un toque para maullar, dos para ronronear.`}
      onClick={reactToTap}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        triggerCatReaction("meow");
      }}
    >
      <path className="cat-tail" d="M137 122c34 2 37-34 13-38-18-3-19 17-7 22" fill="none" strokeWidth="13" strokeLinecap="round" />
      <ellipse className="cat-body" cx="92" cy="120" rx="50" ry="43" />
      {kind === "siamese" ? <ellipse className="cat-chest" cx="91" cy="128" rx="25" ry="30" /> : null}
      {kind === "tuxedo" ? <ellipse className="tuxedo-chest" cx="91" cy="128" rx="28" ry="32" /> : null}
      <path className="cat-head" d="M48 71 42 29l30 19a58 58 0 0 1 39 0l29-19-6 43c5 10 7 20 5 31-4 25-25 40-50 39-25 0-45-16-48-40-2-11 1-22 7-31Z" />
      {kind === "tuxedo" ? (
        <>
          <path className="tuxedo-face" d="M85 47c-5 13-7 27-3 40l10 13 10-13c4-13 2-27-3-40l-7 14Z" />
          <ellipse className="tuxedo-muzzle" cx="92" cy="108" rx="27" ry="20" />
        </>
      ) : null}
      {kind === "siamese" ? (
        <>
          <path className="cat-ear-patches" d="M49 65 45 36l23 15Zm83 0 4-29-23 15Z" />
          <path className="cat-mask" d="M62 67c15-17 46-17 61 0 9 11 10 32 2 45-11 18-51 18-64 0-9-13-8-34 1-45Z" />
          <g className="lynx-stripes" fill="none" strokeWidth="4" strokeLinecap="round">
            <path d="m74 55 6 13" />
            <path d="m92 51 1 16" />
            <path d="m110 55-6 13" />
            <path d="m59 78 16 5" />
            <path d="m125 78-16 5" />
            <path d="m56 94 17 2" />
            <path d="m128 94-17 2" />
            <path d="m64 132-12 8" />
            <path d="m119 132 13 8" />
          </g>
        </>
      ) : null}
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
      <path className="cat-paw" d="M51 124c-13-2-24 2-32 11" fill="none" strokeWidth="12" strokeLinecap="round" />
      <path className="cat-smile" d="M92 109c-1 8-9 9-13 5m13-5c1 8 9 9 13 5" fill="none" strokeWidth="3" strokeLinecap="round" />
      <g className="cat-whiskers" fill="none" strokeWidth="2" strokeLinecap="round">
        <path d="M73 108 40 101" />
        <path d="M73 115 38 117" />
        <path d="m110 108 34-7" />
        <path d="m110 115 35 2" />
      </g>
      <text className={`cat-tap-paw ${kind}`} x="92" y="43" textAnchor="middle" aria-hidden="true">🐾</text>
    </svg>
  );
}

function SideWalkingCat({
  kind,
  label,
  className = "",
  onReaction,
}: {
  kind: AnniversaryCatKind;
  label: string;
  className?: string;
  onReaction?: (reaction: "meow" | "purr") => void;
}) {
  const [reaction, setReaction] = useState<"meow" | "purr" | null>(null);
  const tapTimer = useRef<number | null>(null);

  function reactToTap(event: React.MouseEvent<SVGSVGElement>) {
    if (event.detail > 1) {
      if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
      tapTimer.current = null;
      triggerCatReaction("purr");
      return;
    }

    tapTimer.current = window.setTimeout(() => {
      triggerCatReaction("meow");
      tapTimer.current = null;
    }, 240);
  }

  function triggerCatReaction(nextReaction: "meow" | "purr") {
    setReaction(nextReaction);
    playCatAudio(kind, nextReaction);
    onReaction?.(nextReaction);
    window.setTimeout(() => setReaction((current) => (current === nextReaction ? null : current)), nextReaction === "purr" ? 1300 : 900);
  }

  return (
    <svg
      className={`side-walking-cat ${kind} ${className}${reaction ? ` ${reaction}` : ""}`}
      viewBox="0 20 220 105"
      role="button"
      tabIndex={0}
      aria-label={`${label}. Un toque para maullar, dos para ronronear.`}
      onClick={reactToTap}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        triggerCatReaction("meow");
      }}
    >
      <path className="side-tail" d="M64 88C40 84 24 62 30 44c2-7 11-8 13-1 4 13 13 22 25 26Z" />
      <g className="side-back-legs" fill="none" strokeWidth="10" strokeLinecap="round">
        <path className="side-leg leg-back-a" d="M64 96c-2 9-3 15-5 22" />
        <path className="side-leg leg-back-b" d="M86 100c1 8 2 13 3 19" />
      </g>
      <path className="side-body" d="M134 55c-22-9-58-8-77 4-17 11-19 33-4 43 18 12 60 13 81 4 14-6 16-25 10-36-3-6-6-12-10-15Z" />
      {kind === "siamese" ? <ellipse className="side-chest" cx="122" cy="94" rx="20" ry="17" /> : null}
      {kind === "tuxedo" ? <path className="side-tuxedo-chest" d="M116 62c8 14 9 30 3 44 13-3 24-11 27-24-5-11-17-18-30-20Z" /> : null}
      {kind === "orange" ? (
        <g className="side-stripes" fill="none" strokeWidth="5" strokeLinecap="round">
          <path d="M68 63c14-4 28-4 42-1" />
          <path d="M60 78c17-5 36-5 53-1" />
          <path d="M64 92c15 4 31 5 46 2" />
        </g>
      ) : null}
      {kind === "siamese" ? (
        <g className="side-stripes" fill="none" strokeWidth="3.5" strokeLinecap="round">
          <path d="M70 64c13-4 26-4 39-1" />
          <path d="M62 79c16-5 33-5 49-1" />
        </g>
      ) : null}
      <g className="side-front-legs" fill="none" strokeWidth="10" strokeLinecap="round">
        <path className="side-leg leg-front-a" d="M112 100c-1 8-2 13-3 19" />
        <path className="side-leg leg-front-b" d="M130 97c2 9 4 15 6 21" />
      </g>
      <g className="side-head-group" transform="translate(99 19) scale(0.62)">
        <path className="side-head" d="M48 71 42 29l30 19a58 58 0 0 1 39 0l29-19-6 43c5 10 7 20 5 31-4 25-25 40-50 39-25 0-45-16-48-40-2-11 1-22 7-31Z" />
        {kind === "tuxedo" ? (
          <>
            <path className="side-tuxedo-face" d="M85 47c-5 13-7 27-3 40l10 13 10-13c4-13 2-27-3-40l-7 14Z" />
            <ellipse className="side-tuxedo-muzzle" cx="92" cy="108" rx="27" ry="20" />
          </>
        ) : null}
        {kind === "siamese" ? (
          <>
            <path className="side-mask" d="M49 65 45 36l23 15Zm83 0 4-29-23 15Z" />
            <path className="side-mask" d="M62 67c15-17 46-17 61 0 9 11 10 32 2 45-11 18-51 18-64 0-9-13-8-34 1-45Z" />
            <g className="side-stripes" fill="none" strokeWidth="4" strokeLinecap="round">
              <path d="m74 55 6 13" />
              <path d="m92 51 1 16" />
              <path d="m110 55-6 13" />
              <path d="m59 78 16 5" />
              <path d="m125 78-16 5" />
            </g>
          </>
        ) : null}
        {kind === "orange" ? (
          <g className="side-stripes" fill="none" strokeWidth="6" strokeLinecap="round">
            <path d="m72 48 5 15" />
            <path d="m92 43 1 17" />
            <path d="m113 49-5 14" />
          </g>
        ) : null}
        <ellipse className="side-eye" cx="74" cy="89" rx="6" ry="8" />
        <ellipse className="side-eye" cx="109" cy="89" rx="6" ry="8" />
        <path className="side-nose" d="m87 105 5 4 5-4-5-4Z" />
        <path className="side-mouth" d="M92 109c-1 8-9 9-13 5m13-5c1 8 9 9 13 5" fill="none" strokeWidth="3" strokeLinecap="round" />
        <g className="side-whiskers" fill="none" strokeWidth="3" strokeLinecap="round">
          <path d="M73 108 40 101" />
          <path d="M73 115 38 117" />
          <path d="m110 108 34-7" />
          <path d="m110 115 35 2" />
        </g>
      </g>
      <text className={`cat-tap-paw ${kind}`} x="152" y="30" textAnchor="middle" aria-hidden="true">🐾</text>
    </svg>
  );
}

function CatPlayground({ activeTab, missingKind }: { activeTab: AppTab; missingKind?: AnniversaryCatKind }) {
  const [soundHint, setSoundHint] = useState<"single" | "double">("single");
  const showLove = missingKind !== "orange" && missingKind !== "tuxedo";
  const cats = [
    { kind: "black" as const, label: "Gatito negro", className: "playground-black" },
    { kind: "siamese" as const, label: "Gatita lynx point", className: "playground-lynx" },
    { kind: "orange" as const, label: "Mandarino", className: "playground-orange" },
    { kind: "tuxedo" as const, label: "Gatito esmoquin", className: "playground-tuxedo" },
  ];
  const tabMoments: Record<AppTab, { eyebrow: string; message: string }> = {
    today: { eyebrow: "Compañía tranquila", message: "La patrulla descansa mientras registras tu día." },
    calendar: { eyebrow: "Guardianes del calendario", message: "Mandarino y compañía cuidan cada recuerdo." },
    chart: { eyebrow: "Curiosos de los patrones", message: "La patrulla observa tus ritmos desde un lugar seguro." },
    map: { eyebrow: "Exploradores del ciclo", message: "Un paseo suave por cada etapa de tu ciclo." },
    ai: { eyebrow: "Ayudantes de Alba", message: "Cuatro asistentes atentos para pensar contigo." },
    settings: { eyebrow: "Rincón de la patrulla", message: "Los gatitos esperan aquí, lejos de tus controles." },
  };
  const moment = tabMoments[activeTab];

  return (
    <section className={`cat-playground tab-${activeTab}`} aria-label="Patrulla de gatitos de Alba">
      <div className="cat-playground-copy">
        <div>
          <span>{moment.eyebrow}</span>
          <p>{moment.message}</p>
        </div>
        <strong>{soundHint === "single" ? "Toca para saludar" : "Doble toque: miau"}</strong>
      </div>
      <div className="cat-playground-track">
        {cats.filter((cat) => cat.kind !== missingKind).map((cat) => (
          <AnniversaryCat
            key={cat.kind}
            kind={cat.kind}
            label={cat.label}
            className={`cat-playground-cat ${cat.className}`}
            onReaction={(reaction) => setSoundHint(reaction === "meow" ? "double" : "single")}
          />
        ))}
        {showLove ? <span className="playground-love" aria-hidden="true">💕</span> : null}
        {missingKind ? <WanderingCat activeTab={activeTab} kind={missingKind} /> : null}
      </div>
    </section>
  );
}

function WanderingCat({ activeTab, kind }: { activeTab: AppTab; kind: AnniversaryCatKind }) {
  const labels: Record<AnniversaryCatKind, string> = {
    black: "Gatito negro paseando por Alba",
    orange: "Mandarino paseando por Alba",
    siamese: "Gatita lynx point paseando por Alba",
    tuxedo: "Gatito esmoquin paseando por Alba",
  };

  return (
    <div className={`wandering-cat wandering-${kind} wandering-${activeTab}`}>
      <SideWalkingCat kind={kind} label={labels[kind]} />
    </div>
  );
}

function playCatAudio(kind: AnniversaryCatKind, reaction: "meow" | "purr") {
  const source = reaction === "purr" ? "/audio/purr-normalized.m4a" : `/audio/meow-${kind}.m4a`;
  const audio = new Audio(source);
  audio.volume = reaction === "purr" ? 0.55 : 0.72;
  void audio.play().catch(() => {
    // Some browsers still block audio despite the tap; the visual reaction remains.
  });
}

function AnniversaryNote({ onClose }: { onClose: () => void }) {
  return (
    <div className="anniversary-note-backdrop" role="dialog" aria-modal="true" aria-label="Nota de mesario">
      <AnniversaryConfetti />
      <section className="anniversary-note">
        <div className="note-cat-row">
          <AnniversaryCat kind="black" label="Gatito negro" />
          <AnniversaryCat kind="orange" label="Mandarino" />
          <AnniversaryCat kind="siamese" label="Gatita lynx point" />
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

function AnniversaryDayDecor({ activeTab }: { activeTab: AppTab }) {
  const tabCats: Record<AppTab, { kind: "orange" | "black" | "siamese"; position: string } | null> = {
    today: null,
    calendar: { kind: "orange", position: "peeker-calendar" },
    chart: { kind: "siamese", position: "peeker-right" },
    map: { kind: "orange", position: "peeker-map" },
    ai: { kind: "black", position: "peeker-ai" },
    settings: { kind: "siamese", position: "peeker-bottom" },
  };
  const cat = tabCats[activeTab];

  return (
    <div className="anniversary-day-decor">
      {Array.from({ length: 14 }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties}>✦</i>)}
      {cat ? (
        <div className={`alba-cat-peeker ${cat.position}`}>
          <AnniversaryCat kind={cat.kind} label="Gatito escondido" />
        </div>
      ) : null}
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

function loadCustomDateActivations(): Record<CustomDateId, boolean> {
  const fallback: Record<CustomDateId, boolean> = { "may-photo-album": false, "mandarino-monthiversary": true, "first-kiss-monthiversary": true };
  const raw = safeLocalGet(CUSTOM_DATE_ACTIVATIONS_KEY);
  if (!raw) return fallback;

  try {
    return { ...fallback, ...(JSON.parse(raw) as Partial<Record<CustomDateId, boolean>>) };
  } catch {
    return fallback;
  }
}

function emptyChatWrappedStats(isLoading: boolean): ChatWrappedStats {
  const activeHours = Array.from({ length: 24 }, (_, hour) => ({ label: `${hour.toString().padStart(2, "0")}h`, count: 0, percent: 0 }));
  const activeWeekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((label) => ({ label, count: 0, percent: 0 }));
  return {
    isLoading,
    error: "",
    totalMessages: 0,
    totalWords: 0,
    kissWords: 0,
    participants: [],
    topWords: [],
    topEmojis: [],
    activeHours,
    activeWeekdays,
    activeMonths: [],
    media: { photos: 0, audio: 0, videos: 0, stickers: 0, shares: 0, other: 0 },
    sampleMoments: [],
  };
}

async function loadChatWrappedStats(): Promise<ChatWrappedStats> {
  const [whatsappResponse, instagramResponse] = await Promise.all([
    fetch("/whatsapp/Chat%20de%20WhatsApp%20con%20Futura%20Esposita%20%F0%9F%92%96.txt"),
    fetch("/instagram/message_1.json"),
  ]);

  if (!whatsappResponse.ok && !instagramResponse.ok) {
    throw new Error("No encontré los archivos exportados en public/whatsapp y public/instagram.");
  }

  const moments: ChatMoment[] = [];

  if (whatsappResponse.ok) {
    moments.push(...parseWhatsAppChat(await whatsappResponse.text()));
  }

  if (instagramResponse.ok) {
    moments.push(...parseInstagramChat(await instagramResponse.json()));
  }

  return buildChatWrappedStats(moments);
}

function parseWhatsAppChat(rawText: string): ChatMoment[] {
  const text = repairMojibake(rawText);
  const lines = text.split(/\r?\n/);
  const moments: ChatMoment[] = [];
  let current: ChatMoment | null = null;
  const messagePattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s+(\d{1,2}):(\d{2})\s*([ap])\.\s*m\. - ([^:]+):\s*([\s\S]*)$/i;

  for (const line of lines) {
    const match = line.match(messagePattern);
    if (!match) {
      if (current && line.trim()) current.text = `${current.text}\n${line.trim()}`;
      continue;
    }

    const [, day, month, year, rawHour, minute, meridiem, sender, content] = match;
    let hour = Number(rawHour) % 12;
    if (meridiem.toLowerCase() === "p") hour += 12;
    const date = new Date(Number(year), Number(month) - 1, Number(day), hour, Number(minute));
    const textContent = repairMojibake(content.trim());
    current = {
      platform: "whatsapp",
      sender: repairMojibake(sender.trim()),
      date,
      text: textContent,
      mediaType: whatsappMediaType(textContent),
    };
    moments.push(current);
  }

  return moments.filter((moment) => !Number.isNaN(moment.date.getTime()));
}

function parseInstagramChat(rawJson: unknown): ChatMoment[] {
  const container = rawJson as { messages?: Array<Record<string, unknown>> };
  return (container.messages ?? []).map((message) => {
    const textParts = [
      typeof message.content === "string" ? repairMojibake(message.content) : "",
      typeof (message.share as { share_text?: unknown } | undefined)?.share_text === "string"
        ? repairMojibake(String((message.share as { share_text?: unknown }).share_text))
        : "",
    ].filter(Boolean);

    return {
      platform: "instagram" as const,
      sender: repairMojibake(String(message.sender_name ?? "Instagram")),
      date: new Date(Number(message.timestamp_ms ?? 0)),
      text: textParts.join("\n"),
      mediaType: instagramMediaType(message),
    };
  }).filter((moment) => !Number.isNaN(moment.date.getTime()));
}

function buildChatWrappedStats(rawMoments: ChatMoment[]): ChatWrappedStats {
  const moments = rawMoments
    .filter((moment) => moment.text || moment.mediaType)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const stats = emptyChatWrappedStats(false);
  const wordCounts = new Map<string, number>();
  const emojiCounts = new Map<string, number>();
  const participantMap = new Map<string, { name: string; messages: number; emojiCounts: Map<string, number> }>();
  const monthCounts = new Map<string, number>();
  const stopWords = new Set([
    "para", "pero", "porque", "como", "esta", "este", "esto", "estas", "estos", "cuando", "donde", "entonces", "tambien", "también",
    "amor", "jaja", "jiji", "jsjs", "jajaja", "jeje", "hola", "holis", "oki", "ok", "que", "con", "por", "los", "las", "una", "uno",
    "del", "estoy", "estas", "estás", "tengo", "tienes", "you", "sent", "attachment", "este", "ese", "esa", "mas", "más", "muy",
  ]);

  for (const moment of moments) {
    stats.totalMessages += 1;
    const participant = participantMap.get(moment.sender) ?? { name: moment.sender, messages: 0, emojiCounts: new Map<string, number>() };
    participant.messages += 1;
    participantMap.set(moment.sender, participant);

    const hour = moment.date.getHours();
    stats.activeHours[hour].count += 1;
    const weekdayIndex = (moment.date.getDay() + 6) % 7;
    stats.activeWeekdays[weekdayIndex].count += 1;
    const monthLabel = format(moment.date, "MMM yyyy", { locale: es });
    monthCounts.set(monthLabel, (monthCounts.get(monthLabel) ?? 0) + 1);

    if (moment.mediaType === "photo") stats.media.photos += 1;
    else if (moment.mediaType === "audio") stats.media.audio += 1;
    else if (moment.mediaType === "video") stats.media.videos += 1;
    else if (moment.mediaType === "sticker") stats.media.stickers += 1;
    else if (moment.mediaType === "share") stats.media.shares += 1;
    else if (moment.mediaType === "media") stats.media.other += 1;

    const analysisText = chatAnalysisText(moment.text);

    for (const emoji of extractEmojis(analysisText)) {
      emojiCounts.set(emoji, (emojiCounts.get(emoji) ?? 0) + 1);
      participant.emojiCounts.set(emoji, (participant.emojiCounts.get(emoji) ?? 0) + 1);
    }

    const words = normalizeWords(analysisText);
    stats.totalWords += words.length;
    stats.kissWords += words.filter((word) => word.startsWith("bes")).length;
    for (const word of words) {
      if (word.length < 4 || stopWords.has(word)) continue;
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }
  }

  const maxHour = Math.max(1, ...stats.activeHours.map((item) => item.count));
  stats.activeHours = stats.activeHours.map((item) => ({ ...item, percent: Math.round(item.count / maxHour * 100) }));
  const maxWeekday = Math.max(1, ...stats.activeWeekdays.map((item) => item.count));
  stats.activeWeekdays = stats.activeWeekdays.map((item) => ({ ...item, percent: Math.round(item.count / maxWeekday * 100) }));
  stats.activeMonths = Array.from(monthCounts, ([label, count]) => ({ label, count }));
  stats.topWords = Array.from(wordCounts, ([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 36);
  stats.topEmojis = Array.from(emojiCounts, ([emoji, count]) => ({ emoji, count })).sort((a, b) => b.count - a.count).slice(0, 18);
  stats.participants = Array.from(participantMap.values())
    .sort((a, b) => b.messages - a.messages)
    .slice(0, 2)
    .map((participant) => ({
      name: participant.name,
      messages: participant.messages,
      emojis: Array.from(participant.emojiCounts, ([emoji, count]) => ({ emoji, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    }));
  stats.firstDate = moments[0] ? displayDate(isoDate(moments[0].date)) : undefined;
  stats.lastDate = moments.at(-1) ? displayDate(isoDate(moments[moments.length - 1].date)) : undefined;
  stats.sampleMoments = moments.filter((moment) => moment.text).slice(-6);

  return stats;
}

function whatsappMediaType(text: string): ChatMoment["mediaType"] {
  const normalized = text.toLowerCase();
  if (!normalized.includes("multimedia omitido")) return undefined;
  if (normalized.includes("audio")) return "audio";
  if (normalized.includes("sticker")) return "sticker";
  if (normalized.includes("video")) return "video";
  return "media";
}

function instagramMediaType(message: Record<string, unknown>): ChatMoment["mediaType"] {
  if (Array.isArray(message.photos)) return "photo";
  if (Array.isArray(message.audio_files) || Array.isArray(message.audio)) return "audio";
  if (Array.isArray(message.videos)) return "video";
  if (Array.isArray(message.sticker)) return "sticker";
  if (message.share) return "share";
  return undefined;
}

function repairMojibake(value: string): string {
  if (!/[ÃÂâð]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from(Array.from(value, (character) => character.charCodeAt(0)).filter((code) => code <= 255));
    const repaired = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return repaired.replace(/\u0000/g, "").trim() || value;
  } catch {
    return value;
  }
}

function normalizeWords(text: string): string[] {
  return chatAnalysisText(repairMojibake(text))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function chatAnalysisText(text: string): string {
  return repairMojibake(text)
    .replace(/<\s*multimedia omitido\s*>/gi, " ")
    .replace(/\bmultimedia omitido\b/gi, " ")
    .replace(/\byou sent an attachment\b/gi, " ")
    .replace(/\byou sent a message\b/gi, " ")
    .replace(/\byou added to a collection:[^\n]*/gi, " ")
    .replace(/\bse elimin[oó] este mensaje\b/gi, " ")
    .replace(/\beliminaste este mensaje\b/gi, " ")
    .replace(/<\s*se edit[oó] este mensaje\.\s*>/gi, " ");
}

function extractEmojis(text: string): string[] {
  return repairMojibake(text).match(/\p{Extended_Pictographic}/gu) ?? [];
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("es-BO", { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function shortParticipantName(name: string): string {
  if (name.toLowerCase().includes("sarit")) return "Sarit";
  if (name.toLowerCase().includes("marvin")) return "Marvin";
  return name.split(" ")[0] ?? name;
}

function BrandLab({
  theme,
  onToggleTheme,
}: {
  theme: "light" | "dark";
  onToggleTheme: (event: React.MouseEvent) => void;
}) {
  const [mascotTab, setMascotTab] = useState<AppTab>("today");
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
        <section className="mt-8" aria-label="Pruebas de mascotas por pestaña">
          <div className="mb-3 flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button className={mascotTab === tab.id ? "secondary-button active-demo" : "secondary-button"} key={tab.id} type="button" onClick={() => setMascotTab(tab.id)}>
                {tab.label}
              </button>
            ))}
          </div>
          <CatPlayground activeTab={mascotTab} missingKind="orange" />
        </section>
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

