# Bitácora de Jara App

Registro de lo hecho, fase por fase. Lo más nuevo va arriba. Sin nombres, correos ni datos personales de socios: se habla de roles. El plan vigente está en `PLAN-JARA-APP.md`.

---

## 2026-10-20 · Fase 1 — Limpieza

**Qué se hizo:**
- Se borraron los huérfanos que ninguna ruta usaba: `src/pages/Tesoreria.jsx`, `src/lib/tesoreria.js`, `src/pages/SinNomina.jsx`, `src/lib/listas.js` y `docs/`. Antes se revisó `docs/`: solo tenía una guía de trabajo para quien lleva Comunicaciones (checklist de GitHub y reglas de uso de IA, ya cubiertas por `CLAUDE.md`); no había nada que pasar a la bitácora.
- **B1:** todos los nombres de `supabase/tests/club.mjs` son ahora inventados (por ejemplo "Aldo Admin Inventado", "Bruno Dóble Inventado"). La lógica de las pruebas no cambió, salvo el texto de una búsqueda que usaba el nombre viejo. El historial de git no se reescribió.
- `src/lib/pedido.js` usa el `llamar` común de `src/lib/supabase.js`: los errores de red de Compras salen en español ("No pudimos conectar con el club…") y no como "Failed to fetch".
- Se creó `.env.example` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY`, sin valores.

**Seguridad:** el 20/10 se revisó el historial completo del repo buscando claves secretas, sin hallazgos. Quedaron activados Secret Protection y Push protection en GitHub.

**Comprobado:** `npm run build`, `npm run test:db` (34 + 126 pruebas) y `npm run test:pedidos` (75 pruebas) pasan.

**Pendiente:** los nombres reales siguen en el historial de git (a propósito, no se reescribe). Siguiente: Fase 2 — Seguridad antes de sumar gente.

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
