import { addDays, addMonths, differenceInCalendarDays, format, isSameMonth, parseISO, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarDays,
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
  Plus,
  Save,
  Sparkles,
  Thermometer,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { buildPhaseMap, phaseMeta } from "./lib/phases";
import { buildExport, clearEntries, deleteEntry, getAllEntries, parseImport, replaceEntries, saveEntry } from "./lib/storage";
import { isSupabaseConfigured, syncWithSupabase, testSupabaseConnection } from "./lib/supabaseSync";
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
  const [insight, setInsight] = useState("");
  const [isInsightLoading, setIsInsightLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTestingCloud, setIsTestingCloud] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [chartWindow, setChartWindow] = useState(14);
  const [chartEndIndex, setChartEndIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<AppTab>("today");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isNavCompact, setIsNavCompact] = useState(false);
  const [showAnniversaryIntro, setShowAnniversaryIntro] = useState(() => {
    const today = isoDate(new Date());
    return today === "2026-05-06" && safeSessionGet("alba-anniversary-2026-05-06") !== "seen";
  });
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const storedEntries = await getAllEntries();
        if (safeLocalGet("alba-demo-mode") === "true") {
          setEntries(await loadMappedDemoEntries());
          setIsDemoMode(true);
          setStatus("Modo demo activo. Estos datos no se sincronizan.");
          return;
        }

        setEntries(storedEntries);
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

  const entryByDate = useMemo(() => new Map(entries.map((entry) => [entry.date, entry])), [entries]);
  const stats = useMemo(() => calculateStats(entries), [entries]);
  const recentEntries = useMemo(() => getRecentEntries(entries, 92), [entries]);
  const phaseByDate = useMemo(() => buildPhaseMap(entries), [entries]);
  const selectedPhase = phaseByDate.get(selectedDate);
  const visiblePhaseDays = useMemo(() => getRecentEntries(entries, 60).map((entry) => phaseByDate.get(entry.date)).filter(Boolean), [entries, phaseByDate]);

  useEffect(() => {
    if (!status) return;
    const timeout = window.setTimeout(() => setStatus(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [status]);

  useEffect(() => {
    setChartEndIndex(Math.max(0, recentEntries.length - 1));
  }, [recentEntries.length]);

  useEffect(() => {
    const nextDraft = entryByDate.get(selectedDate) ?? emptyEntry(selectedDate);
    setDraft(nextDraft);
    setShowAdvanced(Boolean(nextDraft.cervicalMucus || nextDraft.cervixHeight || nextDraft.cervixFirmness || nextDraft.cervixOpenness));
  }, [entryByDate, selectedDate]);

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
    setEntries(await getAllEntries());
    setSaveState("saved");
    if (!options?.quiet) setStatus(`Registro de ${displayDate(normalized.date)} guardado.`);
  }

  async function removeSelected() {
    if (isDemoMode) {
      setEntries((current) => current.filter((entry) => entry.date !== selectedDate));
      setDraft(emptyEntry(selectedDate));
      setStatus(`Registro demo de ${displayDate(selectedDate)} eliminado.`);
      return;
    }

    await deleteEntry(selectedDate);
    setEntries(await getAllEntries());
    setDraft(emptyEntry(selectedDate));
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

    if (!window.confirm("Esto borrara todos los registros locales de este dispositivo.")) return;
    await clearEntries();
    setEntries([]);
    setStatus("Todos los datos locales fueron eliminados.");
  }

  async function loadDemoData() {
    try {
      const imported = await loadMappedDemoEntries();
      safeLocalSet("alba-demo-mode", "true");
      setIsDemoMode(true);
      setEntries(imported);
      setSelectedDate(imported.at(-1)?.date ?? isoDate(new Date()));
      setVisibleMonth(new Date());
      setStatus("Modo demo activo con los ultimos 90 dias. No se sincroniza con la nube.");
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
    setStatus("Modo demo desactivado. Volviste a tus datos reales.");
  }

  async function syncCloudData() {
    if (isDemoMode) {
      setStatus("El modo demo no se sincroniza. Sal del demo para probar la nube con datos reales.");
      return;
    }

    if (!isSupabaseConfigured()) {
      setStatus("Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para sincronizar.");
      return;
    }

    setIsSyncing(true);
    try {
      const mergedEntries = await syncWithSupabase(await getAllEntries());
      await replaceEntries(mergedEntries);
      setEntries(await getAllEntries());
      setStatus("Datos sincronizados con la nube.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo sincronizar.");
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
      setStatus("Conexion con Supabase correcta. Tabla y permisos responden bien.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo probar Supabase.");
    } finally {
      setIsTestingCloud(false);
    }
  }

  function addTemperature() {
    setDraft((current) => ({
      ...current,
      temperatureReadings: [...current.temperatureReadings, createTemperatureReading()],
    }));
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
    setStatus("Exportacion JSON generada.");
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
      setStatus("Lectura generada con Gemini.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo generar la lectura.");
    } finally {
      setIsInsightLoading(false);
    }
  }

  function closeAnniversaryIntro() {
    safeSessionSet("alba-anniversary-2026-05-06", "seen");
    setShowAnniversaryIntro(false);
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      {showAnniversaryIntro ? <AnniversaryIntro onClose={closeAnniversaryIntro} /> : null}
      <section className="border-b border-white/10 bg-paper/95">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <h1 className="app-title text-4xl font-semibold tracking-normal text-white sm:text-5xl">Alba</h1>
            <p className="max-w-md text-sm leading-6 text-white/72">
              Registro personal de ciclo, menstruacion y temperatura basal.
            </p>
          </div>
          {status ? (
            <div className="rounded border border-moss/25 bg-moss/10 px-3 py-2 text-sm text-white/82">
              <Info className="mr-2 inline h-4 w-4 text-moss" aria-hidden="true" />
              {status}
            </div>
          ) : null}
          {isDemoMode ? (
            <div className="rounded border border-marigold/35 bg-marigold/10 px-3 py-2 text-sm leading-6 text-white/82">
              Estas explorando datos demo mapeados a los ultimos 90 dias. No se guardan en Supabase.
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
            <span className="min-w-36 text-center text-sm font-medium capitalize text-white">
              {format(visibleMonth, "MMMM yyyy", { locale: es })}
            </span>
            <button className="icon-button compact" title="Mes siguiente" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))} type="button">
              <ChevronRight aria-hidden="true" size={17} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-white/65">
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
              <h2 className="text-lg font-semibold">Temperaturas bucales recientes</h2>
              <p className="text-xs text-white/55">
                {chartData.length ? `${displayDate(chartData[0].date, "d MMM")} - ${displayDate(chartData.at(-1)!.date, "d MMM")}` : "Sin datos"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="icon-button compact" title="Ver dias anteriores" type="button" disabled={!canMoveChartLeft} onClick={() => setChartEndIndex((current) => Math.max(chartWindow - 1, current - chartWindow))}>
              <ChevronLeft aria-hidden="true" size={17} />
            </button>
            <button className="icon-button compact" title="Alejar" type="button" disabled={chartWindow >= 60} onClick={() => setChartWindow((current) => Math.min(60, current + 7))}>
              <ZoomOut aria-hidden="true" size={17} />
            </button>
            <button className="icon-button compact" title="Acercar" type="button" disabled={chartWindow <= 7} onClick={() => setChartWindow((current) => Math.max(7, current - 7))}>
              <ZoomIn aria-hidden="true" size={17} />
            </button>
            <button className="icon-button compact" title="Ver dias siguientes" type="button" disabled={!canMoveChartRight} onClick={() => setChartEndIndex((current) => Math.min(allChartData.length - 1, current + chartWindow))}>
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
            <EmptyState text="Registra temperaturas bucales para ver una curva comparable." />
          )}
        </div>
      </Panel>
    );
  }

  function renderToday() {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
        <Panel>
          <div className="mb-4">
            <p className="text-sm text-white/70">{displayDate(selectedDate, "EEEE")}</p>
            <h2 className="text-xl font-semibold capitalize">{displayDate(selectedDate)}</h2>
            <p className="mt-1 text-xs text-white/55">
              {saveState === "saving" ? "Guardando..." : saveState === "saved" ? "Guardado" : "Auto-guardado activo"}
            </p>
          </div>
          <div className="space-y-3">
            <div className="info-box">
              Alba puede empezar simple: marca menstruacion, agrega temperatura si la tienes, y deja lo demas para cuando haga falta.
            </div>
            <Stat label="Fase probable" value={selectedPhase?.label ?? "Sin datos"} />
            <Stat label="Dia del ciclo" value={selectedPhase?.cycleDay ? String(selectedPhase.cycleDay) : "Pendiente"} />
            <div className="info-box">{selectedPhase?.description ?? "Agrega datos para construir el mapa del ciclo."}</div>
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Registro del dia</h2>
            <button className="icon-button danger" title="Eliminar registro del dia" onClick={removeSelected} type="button">
              <Trash2 aria-hidden="true" size={18} />
            </button>
          </div>
          <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
            <div className="input-card">
              <h3>1. Menstruacion</h3>
              <p>Marca solo si hoy hubo sangrado. Si no, puedes dejarlo apagado.</p>
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
              <span>Hoy hubo menstruacion</span>
            </label>

            <div>
              <label className="field-label" htmlFor="flow">
                Flujo menstrual
              </label>
              <select id="flow" className="input" value={draft.flow} disabled={!draft.isPeriod} onChange={(event) => setDraft((current) => ({ ...current, flow: event.target.value as FlowLevel }))}>
                {flowOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            </div>

            <div className="input-card">
              <h3>2. Temperatura</h3>
              <p>La toma bucal queda como referencia principal para la grafica. Si registras axilar o vaginal, Alba la guarda como contexto sin mezclar rutinas.</p>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="field-label">Temperaturas</label>
                <button className="text-button" type="button" onClick={addTemperature}>
                  <Plus aria-hidden="true" size={16} />
                  Agregar
                </button>
              </div>
              <div className="space-y-2">
                {draft.temperatureReadings.length === 0 ? (
                  <div className="rounded border border-dashed border-white/15 p-3 text-sm text-white/65">
                    Agrega una temperatura cuando quieras registrar una medicion.
                  </div>
                ) : (
                  draft.temperatureReadings.map((reading) => (
                    <div className="temperature-row" key={reading.id}>
                      <input aria-label="Hora" className="input mt-0" type="time" value={reading.time} onChange={(event) => updateTemperature(reading.id, { time: event.target.value })} />
                      <input aria-label="Temperatura" className="input mt-0" type="number" inputMode="decimal" min="34" max="42" step="0.01" value={reading.value} onChange={(event) => updateTemperature(reading.id, { value: Number(event.target.value) })} />
                      <select className="input mt-0" aria-label="Lugar de medicion" value={reading.site} onChange={(event) => updateTemperature(reading.id, { site: event.target.value as TemperatureSite })}>
                        {temperatureSiteOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <label className="mini-check">
                        <input type="checkbox" checked={reading.isResting} onChange={(event) => updateTemperature(reading.id, { isResting: event.target.checked })} />
                        Reposo
                      </label>
                      <button className="icon-button compact danger" title="Quitar temperatura" type="button" onClick={() => removeTemperature(reading.id)}>
                        <Trash2 aria-hidden="true" size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="info-box">
              Marca reposo cuando la temperatura se tomo al despertar, antes de levantarse, o despues de un periodo sin actividad. Para comparar patrones, intenta usar siempre el mismo lugar de medicion.
            </div>
            </div>

            <div className="input-card">
              <h3>3. Senales opcionales</h3>
              <p>El moco cervical y el cuello ayudan a entender mejor el mapa, pero no hace falta llenarlos todos los dias.</p>
            <label className="toggle-row">
              <input type="checkbox" checked={showAdvanced} onChange={(event) => setShowAdvanced(event.target.checked)} />
              <span>Anadir mas informacion</span>
            </label>

            {showAdvanced ? renderAdvancedFields() : null}
            </div>

            <div className="input-card">
              <h3>4. Nota libre</h3>
            <div>
              <label className="field-label" htmlFor="note">
                Nota
              </label>
              <textarea id="note" className="input min-h-28 resize-y" placeholder="Ej: dormi poco, fiebre, dolor, viaje..." value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} />
            </div>
            </div>

            <button className="primary-button" type="button" onClick={() => persistDraft()}>
              <Save aria-hidden="true" size={18} />
              Guardar ahora
            </button>
          </form>
        </Panel>
      </div>
    );
  }

  function renderAdvancedFields() {
    return (
      <div className="advanced-panel space-y-4">
        <div className="info-box">
          <strong>Como observar:</strong> el moco cervical puede revisarse al limpiar o por la sensacion durante el dia.
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
            <h2 className="text-lg font-semibold">Mapa del ciclo</h2>
          </div>
          <div className="phase-strip">
            {visiblePhaseDays.map((phase) =>
              phase ? (
                <button key={phase.date} className="phase-chip" type="button" title={`${displayDate(phase.date)} - ${phase.label}`} style={{ background: phaseMeta[phase.phase].soft, borderColor: phaseMeta[phase.phase].color }} onClick={() => setSelectedDate(phase.date)}>
                  <span>{displayDate(phase.date, "d")}</span>
                </button>
              ) : null,
            )}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {Object.entries(phaseMeta).map(([key, meta]) => (
              <div className="legend-row" key={key}>
                <span style={{ background: meta.color }} />
                {meta.label}
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Object.entries(phaseMeta).map(([key, meta]) => (
              <div className="phase-explainer" key={`explain-${key}`}>
                <strong style={{ color: meta.color }}>{meta.label}</strong>
                <span>{phaseExplanation(key)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-moss" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Resumen detallado</h2>
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <Stat label="Fase probable" value={selectedPhase?.label ?? "Sin datos"} />
            <Stat label="Confianza" value={selectedPhase?.confidence ?? "Pendiente"} />
            <Stat label="Dia del ciclo" value={selectedPhase?.cycleDay ? String(selectedPhase.cycleDay) : "Pendiente"} />
            <Stat label="Promedio ciclo" value={stats.averageCycleLength ? `${stats.averageCycleLength} dias` : "Pendiente"} />
            <Stat label="Moco cervical" value={optionLabel(mucusOptions, draft.cervicalMucus)} />
            <Stat label="Cuello uterino" value={`${optionLabel(cervixHeightOptions, draft.cervixHeight)} / ${optionLabel(cervixFirmnessOptions, draft.cervixFirmness)}`} />
          </dl>
          <div className="info-box warning mt-3">
            Proxima menstruacion estimada:{" "}
            <strong>{stats.predictedNextPeriod ? displayDate(stats.predictedNextPeriod) : "requiere mas ciclos"}</strong>. Es una prediccion simple, no una indicacion de fertilidad.
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
            <h2 className="text-lg font-semibold">Lectura con IA</h2>
          </div>
          <button className="icon-button compact" title="Generar lectura" onClick={generateInsight} disabled={isInsightLoading || entries.length === 0} type="button">
            {isInsightLoading ? <Loader2 className="animate-spin" aria-hidden="true" size={17} /> : <Sparkles aria-hidden="true" size={17} />}
          </button>
        </div>
        <div className="info-box warning">
          La lectura envia tus registros recientes a Gemini solo cuando presionas el boton. Es orientativa y no diagnostica ni indica fertilidad segura.
        </div>
        <div className="mt-3 min-h-32 whitespace-pre-wrap rounded border border-white/10 bg-paper/70 p-3 text-sm leading-6 text-white/86">
          {insight || (entries.length ? "Genera una lectura cuando quieras revisar patrones del ciclo." : "Agrega registros para generar una lectura.")}
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
          <button className="secondary-button col-span-2" type="button" onClick={syncCloudData} disabled={isSyncing || isDemoMode}>
            <Database aria-hidden="true" size={17} />
            {isDemoMode ? "Demo sin sync" : isSyncing ? "Sincronizando..." : "Sincronizar nube"}
          </button>
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
  if (phase === "period") return "Dias donde se registro sangrado.";
  if (phase === "follicular") return "El cuerpo se prepara para ovular; suele venir despues de la menstruacion.";
  if (phase === "fertile") return "Ventana estimada donde conviene observar moco cervical y temperatura con mas atencion.";
  if (phase === "possible-ovulation") return "Dia probable, no seguro. Alba lo estima con calendario y subida termica cuando existe.";
  if (phase === "thermal-shift") return "La temperatura podria estar cambiando; se observa si se sostiene varios dias.";
  if (phase === "luteal") return "Fase posterior a ovulacion probable; la temperatura suele verse mas alta.";
  return "Rango estimado donde podria iniciar el siguiente periodo.";
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

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="panel rounded border border-white/10 bg-[#171d26] p-4 shadow-soft sm:p-5">{children}</section>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="grid h-full place-items-center rounded border border-dashed border-white/15 text-center text-sm text-white/65">{text}</div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-paper/70 p-3">
      <dt className="text-xs font-medium uppercase tracking-[0.12em] text-white/58">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}

function AnniversaryIntro({ onClose }: { onClose: () => void }) {
  const memories = Array.from({ length: 30 }, (_, index) => ({
    src: `/memories/photo-${index + 1}.jpg`,
    index: index + 1,
  }));

  return (
    <div className="anniversary-story" aria-label="Sorpresa de aniversario">
      <button className="anniversary-close" type="button" onClick={onClose} aria-label="Saltar intro">
        Saltar
      </button>
      <section className="story-cover">
        <p>13 meses</p>
        <h2>Una pequena historia antes de entrar</h2>
        <span>Desliza hacia abajo</span>
      </section>
      <section className="story-stack" aria-label="Album de recuerdos">
        {memories.map((memory) => (
          <StoryPhoto key={memory.src} {...memory} />
        ))}
      </section>
      <section className="story-final">
        <div className="story-overlay-text">
          <p>13 meses</p>
          <h2>Felices 13 meses bonita</h2>
        </div>
        <button className="primary-button mt-8 max-w-sm" type="button" onClick={onClose}>
          Entrar a Alba
        </button>
      </section>
    </div>
  );
}

function StoryPhoto({ src, index }: { src: string; index: number }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const tiltPattern = [-3.2, 2.4, -1.7, 3.1, -2.2, 1.5, -0.8, 2.7];
  const xPattern = [-14, 10, -6, 15, -11, 5, -2, 12];
  const tilt = tiltPattern[(index - 1) % tiltPattern.length];
  const xOffset = xPattern[(index - 1) % xPattern.length];
  const settledY = Math.max(-34, (index - 1) * -1.2);

  return (
    <div className="story-photo-step">
      <figure
        className="story-photo"
        style={
          {
            "--tilt": `${tilt}deg`,
            "--x-offset": `${xOffset}px`,
            "--settled-y": `${settledY}px`,
            "--z": index,
          } as React.CSSProperties
        }
      >
        {!failed ? (
          <img
            src={src}
            alt=""
            className={loaded ? "story-image loaded" : "story-image"}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        ) : null}
        <div className="story-photo-fallback" aria-hidden="true" />
      </figure>
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
