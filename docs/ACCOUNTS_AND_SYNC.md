# Alba: cuentas y sincronizacion

## Estado actual

- Los datos viven primero en IndexedDB.
- Cada guardado o borrado crea una operacion pendiente local.
- La operacion solo sale de la cola cuando Supabase confirma que la recibio.
- Al abrir, recuperar foco o volver a tener internet, Alba reintenta la cola y luego mezcla nube y dispositivo.
- Realtime escucha cambios de `cycle_entries` para `couple_id = 1`.

Esto protege los registros locales durante la migracion. La app no debe limpiar IndexedDB al iniciar sesion ni al vincular una pareja.

## Modelo de cuentas propuesto

### `profiles`

- `id uuid primary key references auth.users`
- `display_name`
- `created_at`

### `couples`

- `id uuid primary key`
- `name` opcional
- `created_by`
- `created_at`

### `couple_members`

- `couple_id`
- `user_id`
- `role`: `owner` o `member`
- `joined_at`
- clave compuesta `couple_id, user_id`

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

Una entrada propia puede quedar `accepted`. Una entrada creada por la pareja puede quedar `pending` si el sujeto activa aprobacion previa.

## Flujo de migracion

1. Activar email y password en Supabase Auth.
2. Crear las tablas nuevas y RLS sin modificar todavia `cycle_entries`.
3. Crear las dos cuentas y una pareja privada.
4. Crear el primer `cycle_subject`.
5. Copiar las filas de `couple_id = 1` al nuevo UUID, conservando fechas, contenido y timestamps.
6. Verificar cantidades y exportar un respaldo JSON.
7. Cambiar la app para obtener `couple_id` y `subject_id` desde la sesion.
8. Mantener IndexedDB y la cola durante toda la migracion.
9. Retirar las policies anonimas de `couple_id = 1` solamente despues de comprobar ambos dispositivos.

## RLS

Las policies deben permitir leer una pareja solo cuando existe una fila en `couple_members` para `auth.uid()`. Escrituras y Realtime deben usar la misma membresia. Nunca se debe exponer `service_role` en el frontend.

## Orden recomendado

1. Estabilizar la cola y Realtime actuales.
2. Agregar pantallas de registro, acceso y recuperacion de password.
3. Crear pareja mediante invitacion de un solo uso.
4. Añadir sujetos y permisos de registro/aprobacion.
5. Migrar los 37 registros actuales con respaldo y validacion.
6. Incorporar recompensas, autoria visible y aprobaciones.
