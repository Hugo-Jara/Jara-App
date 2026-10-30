# PLAN-JARA-APP.md

Plan vigente de Jara App. Se trabaja **una fase por sesión de Claude Code** y cada fase necesita el visto bueno del administrador de la app antes de pasar a la siguiente. El historial de lo hecho está en `BITACORA.md`.

- **Repo:** Hugo-Jara/Jara-App (Supabase propio del club, dominio hugojara.cl)
- **Hitos:**
  - **3/11/2026 (antes 28/10):** reunión con los tesoreros. Ese día tienen que poder entrar a la app y ver su tablero.
  - **21/11/2026:** fiesta de los 20 años y presentación de la app a todo el club.
- **Forma de trabajo:**
  - Sesión de Claude Code en la nube conectada al repo.
  - Cada fase va en un PR. La cuenta del club lo aprueba y se hace Squash and merge.
  - Las migraciones las corre el administrador de la app en Supabase, con la cuenta del club, **antes** del merge.
- **Regla:** este archivo y la bitácora pueden ser públicos. No van nombres, correos ni datos personales de socios; se habla de roles (presidente, tesoreros, administrador de entrenamientos).

---

## Estado al 20/10/2026 (resumen de los traspasos)

**En producción:**
- Ingreso por nombre con aprobación.
- Partidos: asistencia, resultados, estadísticas y filtro por plantel.
- Entrenamientos: cupos, pagos con bitácora y multas por bajarse tarde.
- Compras por link, con los comprobantes en el bucket privado.
- Waze de los dos complejos.
- Pantalla de error de conexión en español.
- Correos de ingreso por Resend.
- Vista previa del Fondo en `/fondo`, con datos en memoria.

**Verificado en la Fase 0 (20/10/2026):**
- El v11 **sí está en main**: la pantalla Jugadores con estadísticas (`/jugadores`, `src/pages/Estadisticas.jsx`, con filtro por plantel y por año) y `src/components/CamposFechaHora.jsx` (usado en `PartidoForm.jsx`). No hay nada que recuperar.
- `npm run build`, `npm run test:db` (34 + 126 pruebas) y `npm run test:pedidos` (75 pruebas) pasan en main.
- Las migraciones llegan hasta la 0017 y coinciden con la tabla del `README.md`.
- Lo de los correos por Resend, Google OAuth y la cuenta de prueba vive en Supabase y no se puede comprobar desde el repo; se da por bueno lo que dicen los traspasos.

**Pendientes conocidos:**
- A4 Parte 2: Google OAuth en producción. Es manual, del administrador de la app.
- A4 Parte 3: pruebas en iPhone y Android, y el código de 6 dígitos.
- Auditoría: M1, M2, M3, M5 y B1.
- `llamar` duplicado en `src/lib/pedido.js`, que sigue mostrando "Failed to fetch".
- Archivos huérfanos, confirmados: `Tesoreria.jsx` (solo lo usa `tesoreria.js`, que a su vez solo lo usa esa pantalla), `SinNomina.jsx`, `listas.js` y `docs/`. Ninguno está en las rutas de `App.jsx`.
- `README.md` manda a copiar `.env.example`, pero ese archivo no existe en el repo.
- Cuenta de prueba en Supabase.

---

## Fase 0 — Reconocimiento y orden de documentos
- **Modelo:** Sonnet · conversación nueva
- **Objetivo:** que cualquier sesión futura parta sabiendo dónde está el proyecto.
- **Alcance:**
  - Leer el repo y verificar lo que dicen los traspasos (incluido el v11).
  - Crear `BITACORA.md` con el estado actual y los PR #1–#7.
  - Dejar `CLAUDE.md` corto: stack, comandos, flujo de PR y migraciones, y reglas duras. Entre ellas: español de Chile y tuteo, nada de datos personales en el repo, y no más de una fase por sesión.
  - Agregar este plan a la raíz.
- **Fuera:** cualquier cambio de código.
- **Listo cuando:** el PR solo trae los documentos y el reporte confirma o corrige el estado de arriba.

## Fase 1 — Limpieza
- **Modelo:** Sonnet · /clear
- **Alcance:**
  - Borrar los archivos huérfanos (Tesoreria.jsx, tesoreria.js, listas.js, SinNomina.jsx y docs/) después de confirmar que nada los importa.
  - B1: reemplazar **todos** los nombres de `supabase/tests/club.mjs` por nombres inventados (hoy hay al menos uno que corresponde a una persona real del club). El historial de git no se reescribe.
  - Que `pedido.js` use el `llamar` común, con los errores en español.
  - Si hace falta, crear `.env.example` (el `README.md` lo menciona y no existe).
- **Listo cuando:** la app compila, `test:db` y `test:pedidos` pasan, y Compras muestra los errores en español.

## Fase 2 — Seguridad antes de sumar gente
- **Modelo:** Opus · /clear
- **Por qué ahora:** el 28/10 entran los tesoreros, y después todo el club. Los huecos de permisos hay que cerrarlos antes de que haya más usuarios.
- **Alcance:**
  - M1: un encargado solo gestiona su propio plantel.
  - M2: cerrar los permisos de las tablas 0001 y 0002.
  - M3: que la nómina no se pueda enumerar sin ser socio.
  - M5: evitar el doble toque en "Sumar invitado".
  - Todo con migración y pruebas nuevas.
- **Listo cuando:** las pruebas cubren cada caso. El administrador de la app corre la migración y prueba con dos cuentas de planteles distintos.

## Orden de las fases (actualizado)
**Hecho:** Fases 0, 1, 2, 2b y 3 (20/10), Compras 1, Compras 1b y Fase 4 (21/10).

**Lo que queda:** Compras 2 → Compras 3 → Fase 5 → Fase 6b → Fase 7 → Fase 8 → **hito sáb 21/11**. La reunión con los tesoreros es el **martes 3/11** y llega con la Fase 4 (tablero demo) ya en main; lo que salga de ahí entra en la Fase 5.

**Corrección del 30/10/2026:** el cambio de orden anterior (Fase 4 antes de la Fase 3) se escribió sin ver que las dos ya estaban hechas desde el 20 y el 21 de octubre. El 29/10 se priorizó Compras y Tesorería, así que lo siguiente es Compras 2.

Sin fechas intermedias: solo quedan los hitos 3/11 y sáb 21/11. Las secciones de abajo siguen el orden anterior; el orden vigente es el de esta sección.

---

## Fase 3 — Ingreso a prueba de celulares (A4 Parte 3)
- **Modelo:** Sonnet · /clear
- **Requisito:** El administrador de la app ya pasó Google OAuth a producción (A4 Parte 2) y borró la cuenta de prueba.
- **Alcance:**
  - Código de 6 dígitos en el correo (`{{ .Token }}`) como alternativa al link, para la app instalada en iPhone.
  - Checklist de pruebas en iPhone y Android.
- **Listo cuando:** el administrador de la app entra desde los dos sistemas con Google y con el código.

## Compras 1 — Compras integrado a la app
- **Modelo:** Opus · conversación nueva
- **Alcance:**
  - Reemplaza la pantalla "Llega el 19 de octubre".
  - Los pedidos se ven y se crean desde la app, con cuenta, con tópico (Fondo, 20 años, General).
  - El link sin cuenta sigue funcionando sobre los mismos datos.

## Compras 1b — Compras por tópico
- **Modelo:** Opus · conversación nueva
- **Alcance:**
  - Se entra por tópico y no por lista; las listas quedan por dentro y la app no las muestra. Hoy hay un solo tópico activo: "Fiesta 20 años".
  - Link público por tópico para enviar solicitudes sin cuenta: solo sirve para enviar, no deja leer nada. Los links viejos por lista dejan de servir; el de Hacienda sigue.
  - Formulario: qué, monto, cotización (obligatoria) y referencia (opcional), con límites de largo, monto y archivo.
  - Se archivan las listas de prueba.
- **Nota:** necesita migración nueva; la revisan el administrador de la app y Hacienda antes de aplicarla. El tópico "Fondo" se activa en Compras 2.

## Compras 2 — Fondo
- **Modelo:** Opus · conversación nueva
- **Requisito:** Compras 1 terminada, y las respuestas de la reunión del fondo del 20/10 anotadas en la bitácora.
- **Alcance:**
  - Ítems del presupuesto.
  - Respaldos con archivos privados.
  - Honorarios del entrenador.
  - Panel del fondo.
  - Permisos solo para el equipo del fondo.
- **Nota:** necesita migración nueva; la revisan el administrador de la app y Hacienda antes de aplicarla.

## Compras 3 — Rendiciones
- **Modelo:** Opus · conversación nueva
- **Requisito:** Compras 2 terminada.
- **Alcance:**
  - Hoja tipo Anexo N°1.
  - Registro de las rendiciones presentadas.
- **Aviso:** el equipo del fondo empieza a usarlo solo cuando estén cerradas las tres (Compras 1, 2 y 3).

## Fase 4 — Tablero de tesoreros en modo demo
- **Modelo:** Sonnet · /clear (el diseño se define antes en el chat)
- **Alcance:**
  - Un tablero por plantel: plata disponible, quién pagó y quién no, cuánto falta recaudar, ingresos y egresos.
  - Una vista de Hacienda con el aporte entregado y el pendiente de cada plantel, y Entrenamiento como línea aparte (solo lectura, sin aporte por jugador).
  - Datos inventados y una etiqueta visible de "DEMO".
  - Cuentas de los tesoreros creadas, con su rol.
- **Fuera:** los datos reales, que van en la Fase 5.
- **Listo cuando:** el administrador de la app entra como cada tesorero y ve solo su plantel, y como Hacienda ve el consolidado.

**▶ Hito 3/11 (antes 28/10): reunión con los tesoreros.** El administrador de la app trae al chat los comentarios de la reunión.

## Fase 5 — Tablero de tesoreros con datos reales
- **Modelo:** Opus · conversación nueva
- **Alcance:**
  - Conectar la nómina y los pagos desde la app de tesorería o sus planillas, según lo que se decida en la reunión.
  - Aplicar los ajustes que salgan de la reunión.
- **Listo cuando:** cada tesorero ve los números reales de su plantel y estos cuadran con su planilla.

## Fase 6b — Calendario de partidos
- **Modelo:** Opus · conversación nueva
- **Alcance:**
  - En Partidos se ve solo el próximo partido de cada plantel del jugador, y un botón "Ver próximos partidos" con el resto en lista compacta (fecha, rival, cancha, estado).
  - Estados del partido: programado, suspendido (con motivo: lluvia, cancha u otro), reprogramado (nueva fecha, conservando la original) y por definir (sin fecha).
  - Al reprogramar se mantienen las confirmaciones, pero el partido queda marcado como "fecha nueva, reconfirma".
  - Carga del fixture completo de una vez: el encargado pega la tabla de la liga (fecha, hora, rival, cancha).
- **Nota:** necesita migración nueva (estado, motivo y fecha original); la revisa el administrador de la app antes de aplicarla.

## Fase 7 — Perfil del jugador
- **Modelo:** Sonnet · /clear (el modelo de datos se define antes en el chat)
- **Alcance:**
  - Foto, posición, pie hábil y dorsal por plantel.
  - Estatura y peso opcionales, con visibilidad elegida por el jugador.
  - Estadísticas individuales.
- **Listo cuando:** el administrador de la app edita su perfil y lo ve desde otra cuenta.

## Fase 8 — Pulido para la fiesta
- **Modelo:** Sonnet · /clear
- **Alcance:**
  - Recorrido completo de la app como socio nuevo.
  - Arreglos visuales.
  - Textos de bienvenida.
  - Ensayo de la presentación.

**▶ Hito 21/11: fiesta de los 20 años.**

---

## Después de la fiesta (sin orden fijo)
- Tablón del cuerpo técnico con "quién lo vio" (no es un chat) y repositorio de material. Los videos van al Drive del club.
- Notificaciones: primero dentro de la app, después push.
- Campeonatos y tablas de goleadores, asistencias y tarjetas.
- Plataforma de Comunicaciones: boletín armado en la app, con descargable para WhatsApp. Lo toma un voluntario del club; si al 31/10 no hay avance, lo asume el administrador de la app y se replanifica.
- Hacienda: cuadratura con la cuenta corriente.
- Historias de 24 horas.
- Canchas de Huechuraba.
- Importar automáticamente el fixture desde las páginas de las ligas (temporada 2027), investigando antes qué publica cada liga.

## Tareas manuales del administrador de la app (fuera del código)
- **Antes de la Fase 3:**
  - Google OAuth en producción.
  - Borrar la cuenta de prueba en Supabase.
- **Antes del 3/11:**
  - Correos de los tesoreros.
- **Cuando haya tiempo:**
  - DMARC.
  - Cliente antiguo de Google OAuth.
  - Invitación del voluntario de Comunicaciones a GitHub.
  - Cuentas de los socios nuevos en @hugojara.cl.
