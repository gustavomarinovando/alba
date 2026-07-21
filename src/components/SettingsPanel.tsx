import { differenceInCalendarDays } from "date-fns";
import { Bell, Clipboard, ClipboardCheck, Database, Download, Eraser, FileUp, Sparkles } from "lucide-react";
import type { RefObject } from "react";
import { CAT_KINDS, SideWalkingCat } from "./AnniversaryCat";
import type { AlbaAccountContext } from "../lib/supabaseAuth";

type CustomDateId = "may-photo-album" | "mandarino-monthiversary" | "first-kiss-monthiversary";
type BrowserNotificationPermission = NotificationPermission | "unsupported";

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

interface SettingsPanelProps {
  accountContext: AlbaAccountContext | null;
  isAuthenticating: boolean;
  isAuthReady: boolean;
  authEmail: string;
  onAuthEmailChange: (value: string) => void;
  authPassword: string;
  onAuthPasswordChange: (value: string) => void;
  onLogIn: (event: React.FormEvent) => void;
  onLogOut: () => void;
  partnerConnected: boolean;
  partnerEmail: string | null;
  pendingInvite: { expiresAt: string } | null;
  createdInvite: { code: string; expiresAt: string } | null;
  isGeneratingInvite: boolean;
  inviteCopied: boolean;
  onGeneratePartnerInvite: () => void;
  onCopyInviteCode: () => void;
  onEndRelationship: (value: { asOwner: boolean }) => void;
  isDemoMode: boolean;
  onExitDemoMode: () => void;
  onLoadDemoData: () => void;
  onExportData: () => void;
  importInput: RefObject<HTMLInputElement | null>;
  onImportData: (file?: File) => void;
  isTestingCloud: boolean;
  onTestCloudConnection: () => void;
  isSyncing: boolean;
  isPreparingSyncPreview: boolean;
  onPrepareCloudSync: () => void;
  onWipeData: () => void;
  temperatureRemindersEnabled: boolean;
  notificationPermission: BrowserNotificationPermission;
  onDisableTemperatureReminders: () => void;
  onEnableTemperatureReminders: () => void;
  onTestReminder: () => void;
  uiTheme: "liquid" | "legacy";
  onUiThemeChange: (theme: "liquid" | "legacy") => void;
  customDateActivations: Record<CustomDateId, boolean>;
  onReplayCustomDate: (id: CustomDateId) => void;
  onToggleCustomDateActivation: (id: CustomDateId) => void;
  liveSyncState: "off" | "connecting" | "live" | "error";
  pendingMutationCount: number;
}

export default function SettingsPanel({
  accountContext,
  isAuthenticating,
  isAuthReady,
  authEmail,
  onAuthEmailChange,
  authPassword,
  onAuthPasswordChange,
  onLogIn,
  onLogOut,
  partnerConnected,
  partnerEmail,
  pendingInvite,
  createdInvite,
  isGeneratingInvite,
  inviteCopied,
  onGeneratePartnerInvite,
  onCopyInviteCode,
  onEndRelationship,
  isDemoMode,
  onExitDemoMode,
  onLoadDemoData,
  onExportData,
  importInput,
  onImportData,
  isTestingCloud,
  onTestCloudConnection,
  isSyncing,
  isPreparingSyncPreview,
  onPrepareCloudSync,
  onWipeData,
  temperatureRemindersEnabled,
  notificationPermission,
  onDisableTemperatureReminders,
  onEnableTemperatureReminders,
  onTestReminder,
  uiTheme,
  onUiThemeChange,
  customDateActivations,
  onReplayCustomDate,
  onToggleCustomDateActivation,
  liveSyncState,
  pendingMutationCount,
}: SettingsPanelProps) {
  return (
    <Panel className="settings-panel">
      <div className="settings-hero">
        <div className="settings-hero-icon"><Database aria-hidden="true" size={22} /></div>
        <div><span className="eyebrow">Tu espacio</span><h2>Ajustes</h2><p>Cuenta, privacidad, recordatorios y experiencias de Alba.</p></div>
      </div>
      <div className="settings-group-heading"><span className="eyebrow">Cuenta y datos</span></div>
      <section className="settings-section account-section">
        <div className="settings-section-heading"><div><span className="eyebrow">Identidad</span><h3>Cuenta Alba</h3></div><span className="settings-status-dot">Protegida</span></div>
        {accountContext ? (
          <div className="account-summary">
            <div className="account-avatar">{accountContext.subjectName.slice(0, 1).toUpperCase()}</div>
            <div className="account-copy">
              <strong>{accountContext.subjectName}</strong><span>{accountContext.email}</span>
              <small>Sincronización privada activa</small>
            </div>
            <button className="secondary-button compact-action" type="button" onClick={onLogOut} disabled={isAuthenticating}>Cerrar sesión</button>
          </div>
        ) : (
          <form className="mt-2 grid gap-3" onSubmit={onLogIn}>
            <label className="grid gap-1 text-sm">
              Correo
              <input className="input" type="email" autoComplete="email" value={authEmail} onChange={(event) => onAuthEmailChange(event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              Contraseña
              <input className="input" type="password" autoComplete="current-password" value={authPassword} onChange={(event) => onAuthPasswordChange(event.target.value)} />
            </label>
            <button className="primary-button" type="submit" disabled={!isAuthReady || isAuthenticating || !authPassword}>
              {isAuthenticating ? "Entrando..." : "Iniciar sesión"}
            </button>
            <p className="text-xs text-ink/60">Iniciar o cerrar sesión nunca borra IndexedDB.</p>
          </form>
        )}
        {accountContext?.role === "owner" ? (
          <div className="invite-card">
            <div><strong>{partnerConnected ? "Tu pareja" : "Invitar a tu pareja"}</strong><p>{partnerConnected ? `${partnerEmail ?? "Tu pareja"} tiene acceso a los registros compartidos.` : pendingInvite && !createdInvite ? "Hay una invitación activa. Por seguridad, el código solo se muestra en el dispositivo donde se creó; puedes generar uno nuevo (reemplaza al anterior)." : "Crea un código privado, válido durante 7 días y para un solo uso."}</p></div>
            {partnerConnected ? <button className="secondary-button danger" type="button" onClick={() => onEndRelationship({ asOwner: true })} disabled={isAuthenticating}>Retirar acceso de pareja</button> : <button className="secondary-button" type="button" onClick={onGeneratePartnerInvite} disabled={isAuthenticating}>{isGeneratingInvite ? "Preparando algo especial…" : pendingInvite ? "Crear nueva invitación" : "Crear invitación"}</button>}
            {isGeneratingInvite ? <div className="invite-code generating" aria-live="polite"><code>✦ ✦ ✦ ✦ ✦ ✦</code><small>Barajando tu código…</small></div> : createdInvite && !partnerConnected ? (
              <div className="invite-code revealed">
                <code>{createdInvite.code}</code>
                <small>Vence: {new Date(createdInvite.expiresAt).toLocaleString("es")}</small>
                <button className="secondary-button invite-copy" type="button" onClick={onCopyInviteCode}>
                  {inviteCopied ? <ClipboardCheck aria-hidden="true" size={16} /> : <Clipboard aria-hidden="true" size={16} />}
                  {inviteCopied ? "¡Copiado!" : "Copiar código"}
                </button>
              </div>
            ) : pendingInvite && !partnerConnected ? (
              <div className="invite-code pending"><code>••••••••••••</code><small>Invitación activa, vence: {new Date(pendingInvite.expiresAt).toLocaleString("es")}</small></div>
            ) : null}
          </div>
        ) : accountContext ? <div className="invite-card"><strong>Conectado con {accountContext.subjectName}</strong><p>{partnerEmail ? `Compartes este espacio con ${partnerEmail}.` : "Tu acceso de pareja está activo."} No necesitas la contraseña de la dueña.</p><button className="secondary-button danger" type="button" onClick={() => onEndRelationship({ asOwner: false })} disabled={isAuthenticating}>Salir de esta pareja</button></div> : null}
      </section>
      <section className="settings-section">
        <div className="settings-section-heading"><div><span className="eyebrow">Privacidad y respaldo</span><h3>Tus datos</h3></div></div>
        <p className="settings-section-copy">Exporta una copia, restaura un respaldo o revisa la sincronización.</p>
      <div className="settings-action-grid">
        <button className={isDemoMode ? "secondary-button active-demo" : "secondary-button"} type="button" onClick={isDemoMode ? onExitDemoMode : onLoadDemoData}>
          <Database aria-hidden="true" size={17} />
          {isDemoMode ? "Salir demo" : "Demo"}
        </button>
        <button className="secondary-button" type="button" onClick={onExportData}>
          <Download aria-hidden="true" size={17} />
          Exportar
        </button>
        <button className="secondary-button" type="button" onClick={() => importInput.current?.click()}>
          <FileUp aria-hidden="true" size={17} />
          Importar
        </button>
        <button className="secondary-button col-span-2" type="button" onClick={onTestCloudConnection} disabled={isTestingCloud}>
          <Database aria-hidden="true" size={17} />
          {isTestingCloud ? "Probando..." : "Probar conexion Supabase"}
        </button>
        <button className="secondary-button col-span-2" type="button" onClick={onPrepareCloudSync} disabled={isSyncing || isPreparingSyncPreview || isDemoMode}>
          <Database aria-hidden="true" size={17} />
          {isDemoMode ? "Demo sin sync" : isSyncing ? "Sincronizando..." : isPreparingSyncPreview ? "Preparando..." : "Sincronizar nube"}
        </button>
      </div>
      <div className="settings-danger-zone">
        <span className="settings-danger-label">Zona de riesgo</span>
        <button className="secondary-button danger" type="button" onClick={onWipeData}>
          <Eraser aria-hidden="true" size={17} />
          Borrar todos los datos
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
            <button className="secondary-button danger" type="button" onClick={onDisableTemperatureReminders}>
              <Bell aria-hidden="true" size={17} />
              Desactivar
            </button>
          ) : (
            <button className="secondary-button" type="button" onClick={onEnableTemperatureReminders} disabled={notificationPermission === "unsupported"}>
              <Bell aria-hidden="true" size={17} />
              Activar recordatorios
            </button>
          )}
          <button
            className="secondary-button"
            type="button"
            onClick={onTestReminder}
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

      <div className="settings-group-heading"><span className="eyebrow">Personaliza</span></div>
      <section className="settings-section">
        <div className="settings-section-heading"><div><span className="eyebrow">Apariencia</span><h3>Tema de interfaz</h3></div><span className="settings-status-dot">{uiTheme === "liquid" ? "Líquida" : "Clásica"}</span></div>
        <p className="settings-section-copy">La interfaz líquida añade fondo aurora, paneles de vidrio y animaciones suaves. La clásica conserva el diseño anterior. Se guarda en este dispositivo.</p>
        <div className="settings-action-grid">
          <button className={uiTheme === "legacy" ? "secondary-button active-demo" : "secondary-button"} type="button" onClick={() => onUiThemeChange("legacy")}>Clásica</button>
          <button className={uiTheme === "liquid" ? "secondary-button active-demo" : "secondary-button"} type="button" onClick={() => onUiThemeChange("liquid")}>Líquida ✨</button>
        </div>
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
                  <button className="secondary-button compact-action" type="button" onClick={() => onReplayCustomDate(item.id)}>
                    Reabrir
                  </button>
                  <button
                    className={customDateActivations[item.id] ? "secondary-button compact-action active-demo" : "secondary-button compact-action"}
                    type="button"
                    onClick={() => onToggleCustomDateActivation(item.id)}
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
      <div className="settings-section-heading"><div><span className="eyebrow">Avatares</span><h3>Vista de paseo</h3></div><span className="settings-status-dot">Próximamente</span></div>
      <div className="avatar-setup-card mt-3">
        <div>
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
        {" "}Cambios sin subir a la nube: <strong>{pendingMutationCount}</strong>{pendingMutationCount > 0 ? " (reintentando en cada sincronización)" : ""}.
        Los datos demo son solo para explorar y nunca se suben.
      </div>
      <input ref={importInput} className="hidden" type="file" accept="application/json" onChange={(event) => onImportData(event.target.files?.[0])} />
    </Panel>
  );
}

function daysUntilNextMonthiversary(): number {
  const today = new Date();
  const next = today.getDate() < 6
    ? new Date(today.getFullYear(), today.getMonth(), 6)
    : new Date(today.getFullYear(), today.getMonth() + 1, 6);
  return Math.max(1, differenceInCalendarDays(next, today));
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section data-reveal className={`panel motion-reveal rounded border border-outline bg-surface p-4 shadow-soft sm:p-5 ${className}`}>{children}</section>;
}
