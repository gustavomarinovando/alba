# Alba: cuentas y sincronizacion

Estado: plan de migracion; no ejecutar en produccion sin completar los gates de este documento.

## Estado actual

- Los datos viven primero en IndexedDB.
- Cada guardado o borrado crea una operacion pendiente local.
- La operacion solo sale de la cola cuando Supabase confirma que la recibio.
- Al abrir, recuperar foco o volver a tener internet, Alba reintenta la cola y luego mezcla nube y dispositivo.
- Realtime escucha cambios de `cycle_entries` para `couple_id = 1`.

Esto protege los registros locales durante la migracion. La app no debe limpiar IndexedDB al iniciar sesion ni al vincular una pareja.

## Invariantes de seguridad

- IndexedDB es la copia de seguridad operativa durante registro, login, invitacion y migracion.
- Ningun cambio de sesion puede llamar `clear`, `deleteDatabase` o reemplazar toda la tabla local.
- Una mutacion pendiente local siempre gana frente a un evento Realtime o pull remoto de la misma fecha hasta que Supabase confirme esa revision.
- Cerrar la app, perder conexion o repetir un paso debe ser seguro: todos los pasos de migracion deben ser idempotentes.
- La app no debe mostrar un ciclo calculado desde cache parcial mientras aun desconoce el sujeto/couple activo o espera el primer pull autorizado.
- Exportar y restaurar debe seguir disponible antes, durante y despues de la migracion.
- Ninguna pantalla debe afirmar que una migracion termino hasta validar conteos, fechas y un hash del contenido.

## Modelo de cuentas propuesto

### `profiles`

- `id uuid primary key references auth.users`
- `display_name`
- `created_at`

No guardar datos de salud directamente en `profiles`.

### `couples`

- `id uuid primary key`
- `name` opcional
- `created_by`
- `created_at`

Alba debe permitir una membresia individual inicialmente; invitar pareja es opcional y no bloquea el uso local.

### `couple_members`

- `couple_id`
- `user_id`
- `role`: `owner` o `member`
- `joined_at`
- clave compuesta `couple_id, user_id`

Agregar `status`: `active` o `left`. No borrar historicamente una membresia que ya tenga autoria asociada.

### `couple_invites`

- `id uuid primary key`
- `couple_id uuid`
- `created_by uuid`
- `token_hash text unique` (nunca guardar el token de invitacion en texto plano)
- `expires_at timestamptz`
- `used_at timestamptz` opcional
- `used_by uuid` opcional

La invitacion es de un solo uso, expira y se consume en una transaccion que tambien crea la membresia.

### `cycle_subjects`

Representa a una persona cuyos ciclos se registran. No se debe inferir solamente por el sexo o genero de la cuenta.

- `id uuid primary key`
- `couple_id`
- `profile_id` opcional
- `display_name`
- `can_self_record boolean`
- `created_at`

Una pareja puede tener uno o dos sujetos. Esto cubre relaciones hombre-mujer, mujer-mujer y otros casos sin duplicar el modelo.

### `cycle_entries`

Reemplazar gradualmente `couple_id integer` por:

- `couple_id uuid`
- `subject_id uuid`
- `recorded_by uuid`
- `review_state`: `accepted`, `pending` o `rejected`
- `reviewed_by uuid` opcional
- `entry jsonb`
- `updated_at`

Clave recomendada: `subject_id, date`. Agregar `created_at` y una revision estable (`revision uuid` o version monotona) para confirmar exactamente la mutacion que salio de la cola. Mantener `entry jsonb` en la primera migracion reduce el riesgo de transformar datos clinicamente sensibles durante el cambio de identidad.

### `migration_runs`

Tabla administrativa, no accesible con la anon key:

- `id uuid primary key`
- `source text` (por ejemplo `legacy-couple-1`)
- `target_couple_id uuid`
- `target_subject_id uuid`
- `status`: `prepared`, `copied`, `verified`, `cutover` o `rolled_back`
- conteos y hashes de origen/destino
- timestamps y actor

Impide ejecutar dos veces una copia ambigua y deja evidencia del cutover.

Una entrada propia puede quedar `accepted`. Una entrada creada por la pareja puede quedar `pending` si el sujeto activa aprobacion previa.

## Estrategia de compatibilidad

No cambiar `cycle_entries.couple_id integer` a UUID en sitio. Crear tablas v2 con UUID (por ejemplo `cycle_entries_v2`) y mantener el esquema legado temporalmente en solo compatibilidad. Esto permite desplegar, verificar y revertir la app sin un cast destructivo ni una ventana con tipos incompatibles.

La identidad activa debe llegar a sync como contexto explicito:

```ts
interface SyncContext {
  userId: string;
  coupleId: string;
  subjectId: string;
}
```

Eliminar el `COUPLE_ID = 1` global solo cuando todas las funciones de lectura, escritura, delete, Realtime y push reciban un contexto autenticado. No persistir tokens de sesion dentro de las filas de IndexedDB.

## Flujo de migracion por fases

### Fase 0: preflight y respaldo

1. Bloquear cambios de esquema destructivos y registrar la version desplegada.
2. Vaciar la cola actual solo mediante confirmaciones exitosas; si no puede vaciarse, detener la migracion sin tocar datos.
3. Generar un export JSON local descargable y un snapshot administrativo de las filas legacy.
4. Registrar conteo, rango de fechas y hash canonico de ambos respaldos.
5. Probar que el export se puede parsear y restaurar en una base temporal, no sobre la base activa.

### Fase 1: esquema aditivo

1. Activar email/password y crear `profiles`, `couples`, `couple_members`, `couple_invites`, `cycle_subjects`, `cycle_entries_v2` y `migration_runs`.
2. Aplicar RLS y pruebas de aislamiento antes de escribir datos reales.
3. Crear cuenta, couple y sujeto objetivo sin modificar tablas legacy.
4. Copiar `couple_id = 1` a v2 conservando `date`, `entry`, `createdAt`/`updatedAt` y autoria legacy explicita.
5. Repetir la copia como upsert idempotente y comprobar que no cambia conteos ni hashes.

### Fase 2: app compatible y vinculacion local

1. Desplegar auth y resolucion de `SyncContext` con sync remoto desactivado hasta elegir/verificar sujeto.
2. Guardar en IndexedDB un binding separado (`local dataset -> subjectId`) sin cambiar las claves o entradas existentes.
3. Comparar local y v2 mediante preview. No hacer `replaceEntries` automatico en login.
4. Resolver diferencias por fecha conservando mutaciones pendientes y mostrando confirmacion ante conflictos reales.
5. Marcar el dispositivo como vinculado solo despues de validar conteo/hash y primer pull completo.

### Fase 3: cutover controlado

1. Habilitar escrituras v2 por dispositivo; no hacer dual-write anonimo indefinido.
2. Verificar save, delete, offline/reconnect, Realtime y cierre durante sync en ambos dispositivos.
3. Confirmar que export/import funciona y que un login con cache vacia espera el primer pull antes de calcular el ciclo.
4. Marcar `migration_runs.status = cutover`.
5. Revocar escrituras anonimas legacy. Mantener lectura administrativa temporal para auditoria.
6. Retirar tabla/policies legacy en un release posterior y con backup retenido.

## Rollback

- Antes de cutover: volver la app a legacy; v2 puede descartarse y reconstruirse porque legacy + export siguen intactos.
- Despues de habilitar v2 pero antes de revocar legacy: pausar sync, exportar v2 y reconciliar por revision; nunca sobrescribir IndexedDB masivamente.
- Despues de revocar legacy: reabrir legacy solo mediante una decision operativa explicita. No hacer rollback automatico con dual-write silencioso.
- Un fallo de auth o RLS debe dejar la app en modo local con la cola intacta y un mensaje de estado; no debe cerrar sesion borrando datos.

## RLS

Las policies deben permitir leer una pareja solo cuando existe una fila en `couple_members` para `auth.uid()`. Escrituras y Realtime deben usar la misma membresia. Nunca se debe exponer `service_role` en el frontend.

Reglas adicionales:

- `cycle_subjects` y `cycle_entries_v2` requieren membresia activa en el mismo `couple_id`.
- `recorded_by` debe ser `auth.uid()` en inserts; no aceptarlo libremente desde el cliente.
- Cambiar `review_state` requiere ser el sujeto vinculado o un permiso futuro explicito.
- Una invitacion solo puede ser leida/consumida mediante RPC transaccional; no listar tokens por RLS.
- `push_subscriptions` debe pertenecer a usuario + couple autenticados; el endpoint no puede ser visible a otros clientes.
- Probar acceso permitido y denegado con dos couples diferentes, usuario sin pareja y sesion anonima.

## Riesgos encontrados en la implementacion actual

- `replaceEntries` hace `entries.clear()` y luego `bulkPut`; hoy se usa en pull/import. No usarlo para login o migracion hasta que preserve cola, binding y rollback.
- Importar reemplaza toda la tabla y no crea mutaciones pendientes. Antes del cutover debe convertirse en un flujo de preview + restore transaccional + reconciliacion.
- `deleteAllSupabaseEntries` borra nube antes de `clearEntries`; para cuentas publicas requiere reautenticacion, export reciente y confirmacion del sujeto/couple exacto.
- La cola usa `date` como clave. Con varios sujetos debe usar una clave compuesta estable (`subjectId + date`) y migrarse aditivamente.
- La comparacion por `updatedAt` depende del reloj del dispositivo. Para conflictos entre dispositivos se necesita revision/servidor o al menos desempate determinista y auditoria.
- Filtrar entradas demo y luego reemplazar la tabla es aceptable hoy, pero el modo demo debe quedar fisicamente separado del dataset autenticado antes de migrar cuentas.

## Gates obligatorios antes de produccion

### Data safety review

- [ ] Export local generado, parseado y restaurado en una base temporal.
- [ ] Snapshot legacy con conteo, rango y hash guardado fuera del frontend.
- [ ] Login/logout no borra ni reemplaza IndexedDB.
- [ ] Mutaciones pendientes sobreviven refresh, logout, cambio offline/online y cambio de sesion.
- [ ] Evento Realtime no pisa una mutacion local pendiente.
- [ ] Import tiene preview, confirmacion y rollback; no borra silenciosamente la cola.
- [ ] Cache vacia/parcial no muestra un ciclo enganoso antes del primer pull.
- [ ] Migracion repetida produce los mismos conteos/hashes.
- [ ] Delete total exige reautenticacion, backup y scope visible.
- [ ] El export sigue disponible sin conexion.

### Pruebas de sync

- [ ] Guardar offline en A, reconectar y recibir en B.
- [ ] Editar la misma fecha en A/B y resolver de forma determinista sin perder ninguna version silenciosamente.
- [ ] Borrar offline y comprobar que un pull/Realtime no resucita la entrada mientras el delete esta pendiente.
- [ ] Interrumpir cada fase de migracion y reanudar sin duplicar ni perder filas.
- [ ] Usuario de couple A no puede leer/escribir/suscribirse al couple B.
- [ ] Invitacion vencida, usada o de otro usuario falla sin crear membresia parcial.
- [ ] Push subscription queda asociada al usuario/couple correctos y se revoca al salir.
- [ ] Ambos dispositivos coinciden en conteo/hash antes de retirar policies legacy.

## Orden recomendado

1. Estabilizar la cola y Realtime actuales.
2. Agregar pantallas de registro, acceso y recuperacion de password.
3. Crear pareja mediante invitacion de un solo uso.
4. Añadir sujetos y permisos de registro/aprobacion.
5. Migrar los 37 registros actuales con respaldo y validacion.
6. Incorporar recompensas, autoria visible y aprobaciones.

## Modulos que dependen de cuentas

Cuando el modelo de cuentas este estable, los siguientes modulos deben dejar de vivir solo en localStorage o codigo hardcodeado:

- avatares y companions: ver `docs/AVATARS.md`;
- fechas especiales y experiencias replayables: ver `custom_dates.md`;
- roadmap de lanzamiento y monetizacion: ver `docs/LAUNCH_ROADMAP.md`.

El orden seguro es sincronizar primero datos de salud y permisos, luego avatares, y finalmente experiencias personalizadas con fotos/audio.
