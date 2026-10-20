# Bitácora de Jara App

Registro de lo hecho, fase por fase. Lo más nuevo va arriba. Sin nombres, correos ni datos personales de socios: se habla de roles. El plan vigente está en `PLAN-JARA-APP.md`.

---

## 2026-10-20 · Fase 2b — Fecha y hora en Entrenamiento + plan

**Qué se hizo:**
- `src/pages/EntrenamientoForm.jsx` (abrir y editar listas) ahora usa `CampoFecha` y `CampoHora` de `src/components/CamposFechaHora.jsx`, igual que `PartidoForm.jsx`: calendario claro, campos escribibles con máscara, "/" y ":" automáticos, y botones de sugerencia para hoy, mañana y pasado. Se muestra además la fecha en largo bajo el campo.
- Revisión de otros formularios: no queda ningún otro con fecha u hora que funcione distinto. Los demás campos de texto o número (compras, Fondo, torneo) no son fecha ni hora.
- `PLAN-JARA-APP.md`: nueva "Fase 6b — Calendario de partidos" entre la 6 y la 7, y en "Después de la fiesta" la importación automática del fixture de las ligas (temporada 2027).

**Sin migraciones.**

---

## 2026-10-20 · Fase 2 — Seguridad antes de sumar gente

**Qué se hizo** (todo en la migración `0018_seguridad_antes_de_sumar_gente.sql`, que el administrador de la app corre en Supabase antes del merge):
- **M1:** las listas de entrenamiento las administran solo los administradores y quien tiene `administra_entrenamientos`. Los encargados de plantel ya no abren, editan ni eliminan listas, ni bajan gente. Si alguien que no está en la lista pide entrar a varios planteles, el encargado que aprueba lo suma solo a los planteles que maneja; un administrador, o un encargado de todos ellos, lo suma a todos. Los partidos ya estaban amarrados a su plantel y no cambiaron. Quien es encargado de dos planteles gestiona los dos.
- **M2:** se quitaron todos los permisos directos sobre las tablas de 0001 y 0002 (también la secuencia de los códigos). La app ya pasaba siempre por funciones. Se borraron las dos reglas de Storage del bucket `compras` (0003): nadie las usa, y como consultaban `solicitudes_compra` habrían roto la vista de los comprobantes.
- **M3:** en la búsqueda de la nómina, cada palabra tiene que calzar con el comienzo de una palabra del nombre, y al menos una debe tener tres letras. Los comodines (`%` y `_`) se tratan como letras: antes, escribir `%%%` traía a cualquiera. Si calzan más de 5 personas no se muestra ninguna y se pide escribir también el apellido. Hay un tope de 30 búsquedas por hora por cuenta, registrado en `nomina_busquedas`.
- **M5:** "Sumarlo" queda desactivado mientras se envía. En la base, si la misma persona ya tiene en la lista a un invitado con ese nombre (sin contar tildes, mayúsculas ni espacios), el segundo toque no hace nada.
- Pruebas nuevas para cada caso en `supabase/tests/club.mjs` (M1, M2, M3 y M5) y en `supabase/tests/api-anonima.mjs` (sin sesión: todas las tablas, escribir en `personas` y las funciones de M1, M3 y M5).

**Comprobado:** `npm run build`, `npm run test:db` (34 + 173 pruebas) y `npm run test:pedidos` (75 pruebas) pasan. `api-anonima.mjs` no se pudo correr desde la sesión, porque no tiene las claves: lo corre el administrador de la app con `node --env-file=.env.local supabase/tests/api-anonima.mjs` después de aplicar la migración.

**Antes de correr la 0018:** darle `administra_entrenamientos` a quien lleva Entrenamiento (Table Editor > personas). Si no, solo los administradores podrán abrir listas.

**Pendiente para la Fase 8 (pulido):** en el piloto de Compras por link, cuando no hay señal el mensaje dice "Pídele el link de nuevo a quien te lo mandó" (`src/pages/Pedido.jsx`). Debería decir solo que revises la señal y tener un botón Reintentar.

**Decisión tomada:** los tesoreros de cualquier plantel siguen marcando pagos de entrenamiento (`puedo_cobrar`). Lo confirmó el administrador de la app, así que se mantiene.

**Migración aplicada:** el administrador de la app corrió la 0018 en Supabase el 20/10. `api-anonima.mjs` no se pudo correr desde la sesión porque la red del entorno no deja llegar a Supabase; queda para correrlo desde un computador.

Siguiente: Fase 3 — Ingreso a prueba de celulares.

---

## 2026-10-20 · Fase 1 — Limpieza

**Qué se hizo:**
- Se borraron los huérfanos que ninguna ruta usaba: `src/pages/Tesoreria.jsx`, `src/lib/tesoreria.js`, `src/pages/SinNomina.jsx`, `src/lib/listas.js` y `docs/`. Antes se revisó `docs/`: solo tenía una guía de trabajo para quien lleva Comunicaciones (checklist de GitHub y reglas de uso de IA, ya cubiertas por `CLAUDE.md`); no había nada que pasar a la bitácora.
- **B1:** todos los nombres de `supabase/tests/club.mjs` son ahora inventados (por ejemplo "Aldo Admin Inventado", "Bruno Dóble Inventado"). La lógica de las pruebas no cambió, salvo el texto de una búsqueda que usaba el nombre viejo. El historial de git no se reescribió.
- `src/lib/pedido.js` usa el `llamar` común de `src/lib/supabase.js`: los errores de red de Compras salen en español ("No pudimos conectar con el club…") y no como "Failed to fetch".
- Se creó `.env.example` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY`, sin valores.

**Seguridad:** el 20/10 se revisó el historial completo del repo buscando claves secretas, sin hallazgos. Quedaron activados Secret Protection y Push protection en GitHub.

**Comprobado:** `npm run build`, `npm run test:db` (34 + 126 pruebas) y `npm run test:pedidos` (75 pruebas) pasan.

**Pendiente:** los nombres reales siguen en el historial de git (a propósito, no se reescribe).

**Pendiente menor para la Fase 8 (pulido):** `src/lib/partidos.js` y `src/lib/sesion.jsx` tienen nombres de pila en los datos de demostración. `sesion.jsx` necesita revisión del administrador de la app.

Siguiente: Fase 2 — Seguridad antes de sumar gente.

---

## 2026-10-20 · Fase 0 — Reconocimiento y orden de documentos

**Qué se hizo:** se leyó el repo, se verificó el estado del plan y se ordenaron los documentos (`PLAN-JARA-APP.md`, `BITACORA.md` y un `CLAUDE.md` corto). No se tocó código.

### Estado actual (main en `4616c37`)
- **Con datos reales:** ingreso por nombre con aprobación del encargado; partidos con asistencia, resultados y estadísticas (pantalla Jugadores, con filtro por plantel y por año); entrenamientos con cupos, pagos con bitácora y multas por bajarse tarde; compras por link con cotización, comprobante y boleta, y comprobantes en bucket privado; mapas y Waze de los dos complejos; pantalla de error de conexión en español.
- **Solo en modo demostración (no guarda):** Noticias y boletín, Cuota, páginas de los ministerios y la vista previa del Fondo (`/fondo`).
- **v11 verificado:** la sección Jugadores con estadísticas y `src/components/CamposFechaHora.jsx` están en main.
- **Comprobado hoy:** `npm run build`, `npm run test:db` (34 + 126 pruebas) y `npm run test:pedidos` (75 pruebas) pasan.

### Pull requests
- **#1** Pagos de entrenamiento que no se pierden (auditoría A2): migración 0015.
- **#2** La multa por bajarse corre desde las 5:00 del día del entrenamiento: migración 0016.
- **#3** Sin conexión ya no se confunde con no estar en la nómina (auditoría A3).
- **#4** Se agrega `.gitignore`.
- **#5** Comprobantes de transferencia en un bucket privado (auditoría A1): migración 0017.
- **#6** Vista previa del módulo Fondo Las Condes 2026, con datos en memoria.
- **#7** Fondo: se saca la elección de tópico de "Agregar compra".

### Migraciones aplicadas hasta la 0017
0001 base · 0002 cotizaciones · 0003 storage compras · 0004 funciones de trigger privadas · 0005 pedidos de compra · 0006 storage pedidos · 0007 comprobante de transferencia · 0008 Hacienda edita y elimina · 0009 ingreso por nombre · 0010 partidos · 0011 entrenamientos · 0012 resultado y estadísticas · 0013 administra entrenamientos · 0014 hora de inicio · 0015 pagos de entrenamiento · 0016 multa desde las cinco · 0017 comprobantes privados. Detalle de cada una en la tabla del `README.md`.

### Problemas conocidos
- **A4 Parte 2:** Google OAuth en producción (manual, del administrador de la app).
- **A4 Parte 3:** pruebas en iPhone y Android, y código de 6 dígitos en el correo.
- **Auditoría pendiente:** M1 (un encargado solo debería gestionar su plantel), M2 (permisos de las tablas 0001 y 0002), M3 (la nómina no debería poder enumerarse sin ser socio), M5 (doble toque en "Sumar invitado") y B1 (`supabase/tests/club.mjs` usa al menos un nombre de una persona real del club; hay que reemplazarlos todos por nombres inventados, sin reescribir el historial de git).
- **`llamar` duplicado** en `src/lib/pedido.js`: no traduce los errores de red y Compras sigue mostrando "Failed to fetch".
- **Archivos huérfanos** que ninguna ruta usa: `src/pages/Tesoreria.jsx`, `src/lib/tesoreria.js`, `src/lib/listas.js`, `src/pages/SinNomina.jsx` y `docs/`.
- **`.env.example` no existe**, aunque el `README.md` manda a copiarlo.
- **Cuenta de prueba** pendiente de borrar en Supabase.
- **No verificable desde el repo:** los correos de ingreso por Resend y la configuración de Google OAuth viven en Supabase; se dan por buenos según los traspasos.

### Siguiente
Fase 1 — Limpieza, cuando el administrador de la app dé el visto bueno.
