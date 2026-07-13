# Alba — Claude Handover

Fecha: 2026-07-13. Continuación de la sesión de rediseño UI + streaks + fixes de sync.
Nota: este archivo es local/untracked, igual que `handover.md`. No commitear.

## Estado actual

- Rama: todo integrado y pusheado a `master` (`34d68ec`). `git push origin master` = deploy a producción (Vercel).
- Worktrees y ramas antiguas: mergeadas; pendiente limpieza (comandos ya entregados al usuario).
- Stack: React + Vite + TS, Tailwind + `src/styles.css` (grande, ~3.7k líneas), Dexie/IndexedDB local-first, Supabase (auth + sync + RLS), Recharts (chart lazy-loaded), Web Push por Vercel Cron.
- Producción: https://alba-psi.vercel.app / repo https://github.com/gustavomarinovando/alba.git
- Usuarios reales: Sarit (owner/subject, registra temperaturas) y Gustavo (partner/member). Email prefijado en login: saritcarrillofuentes@gmail.com.

## ⚠️ Migraciones Supabase pendientes de ejecutar (SQL editor, en orden)

1. `supabase/migrations/011_pending_invite_status.sql` — RPC para ver invitación activa desde cualquier dispositivo.
2. `supabase/migrations/012_couple_entry_updates.sql` — **CRÍTICA**: arregla que las temperaturas de Sarit no llegaban a la DB (política RLS de update exigía recorded_by = auth.uid() sobre la fila existente y el upsert atómico fallaba completo).
3. `supabase/migrations/013_streak_rewards.sql` — tabla de cupones de racha.

El cliente degrada con gracia si faltan (fallbacks locales), pero la 012 es la que desbloquea el sync de ella.

## Qué se hizo en esta sesión (commits en master)

- **Rediseño gato lateral**: quedó la versión "chibi v3" (consistente con los gatos frontales). Hubo una versión anatómica realista que se revirtió a petición del usuario (commits revert en historia). Preview de mascotas dev-only: `http://localhost:5173/?mascot-preview=1`.
- **Tema de UI conmutables**: Ajustes → Apariencia → Clásica / Líquida. Clase `.ui-liquid` en `<html>`, persistida como `alba-ui-theme` (default: liquid). TODO el liquid glass está scoped bajo `.ui-liquid` en styles.css. Login rediseñado (orbes aurora + tarjeta de vidrio) solo en Líquida.
- **Liquid glass**: fondo aurora, paneles con blur+brillo especular en hover, press states, tooltips de vidrio. PERF: no poner backdrop-filter en elementos repetidos (botones, celdas de calendario, tickets) — causó lag y se quitó; blur solo en superficies grandes.
- **Invitaciones de pareja**: estado pendiente visible cross-device (RPC 011), botón copiar código, "Crear nueva invitación" reemplaza la activa. `getPartnerStatus()` con fallback a couple_members para que "Retirar acceso de pareja" siempre aparezca si hay pareja.
- **Sync fix**: `syncWithSupabase` ahora sube solo filas nuevas/más recientes (delta) + migración 012.
- **Streak prizes**: `src/lib/streakRewards.ts` + componente `StreakPrizes` en App.tsx (bajo la streak-card en Hoy). Plantillas por categoría (comida/citas/picante/mimos) + cupones custom. Tickets con perforación, barra de progreso, shine/wiggle al desbloquear, sello CANJEADO, gato Mandarino rebotando. Cache local + cloud (tabla streak_rewards). Ambos roles pueden crear; solo el creador borra.
- **Racha del partner**: rol member ve "Racha de compañía" = días consecutivos abriendo la app (localStorage `alba-open-streak`, se registra en el arranque). El owner mantiene racha de observaciones. Los cupones se desbloquean con la racha de observaciones (compartida vía sync).
- **Startup fixes**: splash mientras resuelve la sesión (antes flasheaba el layout de tabs → login); `authenticatedEmail` se setea después del lookup de pareja (antes flasheaba el input de invitación al partner).
- **Gato errante**: vuelve a pasear por la página (fuera del escenario de la patrulla).
- **Cat wandering / mapa / resto**: sin cambios funcionales.

## Convenciones del repo (importante)

- Antes de commitear frontend: `corepack pnpm run lint && corepack pnpm run build`.
- Dev server: `corepack pnpm run dev` (nota: `-- --port X` no funciona, vite elige puerto; mirar el output).
- No commitear: `handover.md`, `claude_handover.md`, exports en `public/instagram/` y `public/whatsapp/`.
- Data local-first: NUNCA borrar/migrar destructivamente IndexedDB. Backups antes de cualquier migración de cuentas.
- Push directo a master = deploy. Preguntar antes de push si el cambio es riesgoso.
- Commits llevan trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Claves localStorage relevantes

- `alba-theme` (light/dark), `alba-ui-theme` (liquid/legacy), `alba-open-streak` (racha del partner), `alba-partner-invite` (código en claro solo en el dispositivo creador), `alba-streak-rewards` (cache de cupones).

## Próximos pasos acordados (en orden recomendado)

1. **Rediseño del chart de temperatura** (`src/components/TemperatureChartPanel.tsx`, autocontenido):
   - BUG real: colores hardcodeados dark → ilegible en tema claro. Migrar a variables CSS.
   - Coverline FAM (regla 3-sobre-6) con relleno suave encima.
   - Bandas de fase de fondo con la misma paleta del Mapa (phaseMeta).
   - Área con gradiente bajo la línea; lecturas dudosas como puntos huecos.
   - Eje en días de ciclo (CD 1, 5, 10…), fechas en tooltip.
   - Periodo como gotas en un carril inferior (no columnas rojas).
   - Pan por arrastre + pinch zoom, botones como fallback. Tap en punto → "Ver día".
2. **Tab IA**: chips de preguntas predefinidas (distintas por rol), historial local de insights, contexto de fase/día automático en el prompt.
3. **Calendario**: franja de color de fase por celda, gota en días de periodo, predicción de próximo periodo en Mapa con chip de cuenta regresiva ("~4 días") + variabilidad de ciclos.
4. **Celebración de desbloqueo de cupón**: confetti + haptics (`navigator.vibrate`) + desfile de gatos la PRIMERA vez que un ticket se desbloquea (persistir para no repetir); opcional push.
5. **Registro de avatares** (docs/AVATARS.md pasos 3–5): registry de gatos, preview en Ajustes (reusar el harness de `?mascot-preview=1`), persistencia.
6. **Bundle**: chunk principal ~844 kB; candidatos a lazy: rueda del Mapa, código de aniversario/celebraciones.

## Testing / verificación

- Screenshots del browser pane fallan (timeout) en este entorno; para verificar SVG/UI se usó rasterización via canvas + JS en la página (función `window.rasterize`, ver transcript) o checks de computed styles via javascript_tool.
- No hay credenciales de login para probar el área autenticada; verificar con lint/build + pantalla de auth + revisión de código. El usuario prueba en móvil tras cada push.
- Flujos de prueba entregados al usuario en cada feature (ver mensajes previos si hay dudas).
