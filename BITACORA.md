# Bitácora de Jara App

Registro de lo hecho, fase por fase. Lo más nuevo va arriba. Sin nombres, correos ni datos personales de socios: se habla de roles. El plan vigente está en `PLAN-JARA-APP.md`.

---

## 2026-10-30 · Compras 2 — Fondo Las Condes de verdad

**Qué se hizo** (migración `0021_fondo.sql`, que el administrador de la app y Hacienda revisan y corren en Supabase antes del merge). Requisitos sacados de la ficha del fondo en el Drive del club (formulario, matriz y respuestas de la reunión del 20/10):
- **Presupuesto** en `fondo_items`, con los montos del formulario: Personal $637.500, Bienes $1.848.000, Materiales $0 y Otros $602.000. Si la Municipalidad aprobó otro monto, se corrige la fila.
- **Gastos del fondo** (`fondo_gastos`): las compras se siguen pidiendo por Compras, en el tópico **"Fondo Las Condes"**, que esta migración activa (queda con su lista abierta y su link público). En `/fondo`, el equipo las pasa al fondo eligiendo el ítem; la cotización, la boleta y el comprobante que ya están en Compras cuentan como respaldo solos. También se puede cargar un gasto directo. Una compra entra al fondo una sola vez; si se saca, vuelve a quedar por clasificar.
- **Honorarios:** quedan creadas las tres cuotas del entrenador (oct, nov y dic), que no se quitan ni cambian de ítem.
- **Respaldos** según el reglamento, con o sin archivo, en el bucket privado `fondo`. **La nómina de entrega y el original firmado se marcan sin archivo:** la nómina trae cédula y domicilio de los participantes y queda solo en papel.
- **Estado de cada gasto** calculado en la base (`fondo_estado`), igual que antes en la vista previa: no rendible si lo pagó un particular o la boleta es anterior al 1/10; lista para rendir con pago del club y todos los respaldos.
- **Rendiciones:** al presentar una entran todos los gastos listos, quedan amarrados a ella y ya no se cambian, desmarcan ni quitan. Se presentan en orden y no vacías. Se marca cuando se subió al portal.
- **Permisos:** solo administradores, Hacienda y quien tenga el permiso nuevo `personas.equipo_fondo`. Las tablas no se leen directamente. `fondo_acceso()` le dice a la app si mostrar el fondo en Más.
- **App:** `/fondo` pasa a estar dentro de la app, con cuenta (ya no es una página suelta). `src/lib/fondo.js` tiene la versión real y la de demostración con la misma forma. Se sacó la pestaña Dudas (ya respondidas en la reunión del 20/10).

**Comprobado:** `npm run build`, `npm run test:db` (174 pruebas) y `npm run test:pedidos` (274 pruebas, 59 nuevas del fondo) pasan. Pantallas revisadas en modo demostración a 375 px, sin scroll horizontal. `api-anonima.mjs` suma las tablas y funciones del fondo; lo corre el administrador de la app después de aplicar la migración.

**Manual, del administrador de la app:**
- Dar `equipo_fondo` a quien administra el fondo (y al presidente, si corresponde): Table Editor > personas > equipo_fondo.
- Probar con esa cuenta y con una de socio (que no debe ver el fondo).

**Pendiente (fuera del código):** confirmar con qué monto y con qué lista aprobó la Municipalidad los bienes; las cotizaciones suman más que lo solicitado (ver la sección 5 de la ficha del fondo). Los honorarios se cargan como bruto de la boleta hasta confirmar si son bruto o líquido.

Siguiente: Compras 3 — Rendiciones (hoja tipo Anexo N°1 y registro de las rendiciones presentadas). Parte de eso ya quedó aquí.

---

## 2026-10-30 · Orden del plan corregido

**Qué se hizo** (solo documentos): el PR #16 dejó en el plan "Fase 4 antes de la Fase 3", pero las dos ya estaban en main desde el 20 y el 21/10, igual que Compras 1 y 1b. Se corrigió el orden en `PLAN-JARA-APP.md`: lo que queda es Compras 2 → Compras 3 → Fase 5 → 6b → 7 → 8. La reunión con los tesoreros pasa al martes 3/11 en todo el plan.

**Por confirmar con el administrador de la app:** si las migraciones 0019 y 0020 ya se corrieron en Supabase (la bitácora solo registra la 0018), y si las cuentas de los tesoreros ya están creadas para mostrar el tablero el 3/11.

Siguiente: Compras 2 — Fondo.

---

## 2026-10-21 · Fase 4 — Tablero de tesoreros (demo)

**Qué se hizo** (solo frontend, **sin migración** y sin tocar `sesion.jsx` ni permisos):
- Ruta `/tablero` y entrada "Tablero de tesorería" en Más, visible solo para quien tiene rol de tesorero de plantel o es Hacienda (`apruebaCompras`, que incluye al administrador). Los demás son redirigidos al inicio. Es un guard de pantalla: como los datos son inventados no hay nada que proteger en la base. **En la Fase 5, el permiso real tiene que venir de la base.**
- **Tesorero de plantel:** ve solo su plantel (con selector si es tesorero de más de uno). **Hacienda:** pestaña Consolidado (total, aporte entregado y pendiente por plantel) y una por plantel, más Entrenamiento como línea aparte de solo lectura, sin aporte por jugador.
- **Cada plantel muestra:** plata disponible, por recaudar, ingresos y egresos de la temporada 2026 acumulada hasta octubre, grilla de cuotas mensuales por jugador (marzo a diciembre) con "al día" o "debe N meses", movimientos de octubre, y aporte al club (corresponde, entregado y falta entregar).
- Etiqueta fija "Datos de ejemplo" en todo el tablero.
- **Datos separados de la presentación:**
  - `src/lib/tableroDemo.js`: datos inventados (jugadores genéricos "Jugador 01", etc.). Cuotas mensuales de $50.000 (Senior Sábado) y $35.000 (Senior Jueves y Junior Sábado); aporte de $4.000 por jugador al mes (inventado).
  - `src/lib/tablero.js`: la forma de los datos (documentada arriba del archivo), los cálculos (por recaudar y estado del jugador salen de la grilla de cuotas) y `useTablero()`.
  - `src/components/tablero/`: componentes que solo reciben datos ya calculados.
- **Conexión a datos reales (Fase 5):** cambiar el cuerpo de `useTablero()` por una llamada con `llamar()` que devuelva la misma forma; las pantallas y los componentes no cambian.
- Solo en modo demostración, `/tablero?como=senior-jueves` (o `senior-sabado`, `junior-sabado`) muestra la vista de un tesorero.

**Supuestos a confirmar:**
- Los planteles se reconocen por el nombre del equipo en la base ("Senior Sábado", "Senior Jueves", "Junior Sábado"). Si el nombre cambia, el tesorero no verá su tablero.
- El aporte por jugador ($4.000 al mes) es inventado: la regla real se define en la reunión.
- El Fondo de Las Condes no está en este tablero; sigue en `/fondo`.

**Manual, del administrador de la app:** crear las cuentas de los tesoreros con su rol de tesorero en el plantel que corresponde, y probar con cada una.

**Comprobado:** `npm run build`, `npm run test:db` (174 pruebas) y `npm run test:pedidos` (215 pruebas) pasan. Revisado a 375 px de ancho, sin scroll horizontal.

Siguiente: hito 28/10 (reunión con los tesoreros) y después Fase 5.

---

## 2026-10-21 · Compras 1b — Compras por tópico

**Qué se hizo** (migración `0020_compras_por_topico.sql`, que el administrador de la app y Hacienda revisan y corren en Supabase antes del merge):
- **Tópicos:** tabla `topicos` (un tópico por fila, con su código de link público). Queda activo "Fiesta 20 años"; "General" queda inactivo y "Fondo" queda creado e inactivo, listo para Compras 2. Agregar un tópico es insertar una fila: su lista abierta se crea sola. No se borra nada.
- **Listas por dentro:** cada tópico activo tiene una sola lista abierta, asegurada con un índice único parcial. Si hubiera dos, la migración falla en vez de elegir una (no se usa "la más antigua"). Se archivan (se cierran y se ocultan) todas las listas menos las que se llaman "Fiesta 20 años"; sus compras no se borran.
- **Link público por tópico** (`/solicitar/<código>`): `topico_publico` entrega solo el nombre y la carpeta donde subir la cotización; `topico_enviar` crea la solicitud y no devuelve nada. El código no se puede adivinar (dos UUID al azar) ni sirve para leer pedidos. Quien envía no ve ni corrige su solicitud; la pantalla de confirmación dice "Si hay algún problema con tu solicitud, te contactamos".
- **Links viejos por lista:** `pedido_ver`, `pedido_agregar`, `pedido_corregir` y `pedido_boleta` ya no aceptan el código de pedir (antes `pedido_ver` mostraba a cualquiera con el link todas las compras de la lista: quién, qué, monto y archivos). El link de Hacienda sigue igual.
- **Límites** al crear una compra (link público, app y link de Hacienda): nombre hasta 80 letras, qué hasta 200, referencia hasta 300, monto hasta $5.000.000, y la cotización tiene que ser PDF o foto de menos de 10 MB; la base lo comprueba mirando el archivo que quedó en Storage. La referencia pasa a ser opcional; la cotización sigue siendo obligatoria.
- **App con cuenta:** Compras parte en el tópico (con uno solo abierto, entra directo; con varios, se elige) y no muestra ningún concepto de lista. Hacienda copia el link público, cierra el tópico y lo reabre. `compras_ver` entrega los tópicos y el código del link solo a Hacienda. Se retiraron `lista_compras_cambiar` y la versión de `compra_agregar` que recibía una lista.
- `supabase/tests/pedidos.mjs`: pruebas de tópicos, índice único, migración que falla ante dos listas abiertas, link público, links viejos, límites, y permisos con cuenta. `supabase/tests/api-anonima.mjs`: sin sesión, las tablas nuevas y las funciones de Compras.

**Revisión:** mueve plata. La revisión de Hacienda la hace el administrador de la app, que es también Hacienda.

**Orden al publicar:** correr la migración y subir la app enseguida: la versión anterior de Compras deja de funcionar apenas se corre la 0020.

**Comprobado:** `npm run build`, `npm run test:db` y `npm run test:pedidos` pasan. Pantallas revisadas en modo demostración a ancho de celular.

**Pendiente:** el link público no pide un dato de contacto, así que "te contactamos" depende de que Hacienda reconozca el nombre. Sin seguimiento por ahora, a pedido del administrador de la app.

Siguiente: Compras 2 — Fondo.

---

## 2026-10-21 · Compras 1 — Compras integrado a la app

**Qué se hizo:**
- Migración `0019_compras_en_la_app.sql` (propuesta aprobada por el administrador de la app, con sus ajustes):
  - Cada lista de compras tiene tópico: Fondo, 20 años o General. Las listas con "20 años" en el nombre quedan en 20 años y el resto en General. Se crea una lista abierta de cada tópico que no tenía ninguna abierta ("Compras generales", "Fondo Las Condes" y, si faltara, "Fiesta 20 años").
  - Las compras pedidas desde la app quedan a nombre de la cuenta (`pedido_items.persona_id`), y el historial anota quién hizo cada paso (`pedido_item_eventos.persona_id`).
  - Permiso personal nuevo `personas.ve_compras` ("ve todas las compras"). `puedo_ver_todas_las_compras()` deja pasar a administradores, Hacienda y quien tenga `ve_compras`. `ve_comprobantes` queda solo para abrir comprobantes de transferencia. A quien tenía `ve_comprobantes` se le dio también `ve_compras`.
  - Funciones nuevas, solo con cuenta: `compras_ver`, `compra_agregar`, `compra_corregir`, `compra_boleta` (quien la pidió o Hacienda) y `compra_revisar`, `compra_comprobante`, `compra_editar`, `compra_eliminar`, `lista_compras_cambiar` (solo Hacienda). Revisan quién llama y usan las mismas funciones del link, que no cambiaron.
- `src/pages/Compras.jsx` reemplaza la pantalla "Llega el 19 de octubre": pedir una compra eligiendo tópico (y lista, si hay más de una abierta), filtro por tópico, totales y la lista de compras. Hacienda tiene además todo lo del link y puede cambiar el tópico de una lista, cerrarla o volver a abrirla y copiar el link de pedir para quien no tiene cuenta.
- `src/pages/Pedido.jsx` exporta el formulario y la tarjeta de compra para usarlos en las dos pantallas; el link se ve y funciona igual.
- Sin señal, el link de pedido dice solo que revises la señal y tiene botón Reintentar (pendiente de la Fase 8, resuelto).
- Pruebas nuevas en `supabase/tests/pedidos.mjs`: un socio no ve compras ajenas, un tesorero de plantel solo ve las suyas, quien tiene `ve_compras` ve todas pero sin `ve_comprobantes` no recibe ni abre comprobantes, Hacienda hace todo desde la app y el link sin cuenta sigue funcionando sobre los mismos datos. `supabase/tests/club.mjs` ahora aplica todas las migraciones en orden.

**Revisión:** la 0019 mueve plata. La revisión de Hacienda la hace el administrador de la app, que es también Hacienda.

**Comprobado:** `npm run build`, `npm run test:db` (34 + 174 pruebas) y `npm run test:pedidos` (122 pruebas) pasan. Pantalla revisada en modo demostración a ancho de celular.

**Pendiente:** hay listas de prueba que la migración puede clasificar mal; Hacienda las corrige o cierra desde Compras > "Ver y corregir las listas".

Siguiente: Compras 2 — Fondo.

---

## 2026-10-20 · Fase 3 — Ingreso a prueba de celulares

**Qué se hizo:**
- `src/pages/Ingreso.jsx`: después de pedir el correo, la pantalla muestra un campo para escribir el código de 6 dígitos (teclado numérico, autocompletado del código en iPhone) además del aviso del link. Usa `verifyOtp` de Supabase; la sesión nueva la toma el escuchador que ya existía. Hay un botón para usar otro correo o pedir otro código.
- `src/lib/sesion.jsx` **no se tocó** (zona de revisión del administrador de la app).
- `CLAUDE.md`: regla nueva, "Antes de empezar una fase, el PR de la fase anterior tiene que estar mergeado; parte siempre desde main actualizado."
- `README.md`: se menciona el ingreso con código.

**Sin migraciones.**

**Manual, del administrador de la app:** pegar las plantillas de correo en Supabase (Authentication → Emails → "Confirm signup" y "Magic Link") con `{{ .Token }}`, y correr el checklist de iPhone y Android. El código dura lo que dure la expiración del OTP configurada en Supabase (por defecto 1 hora); el largo debe quedar en 6.

**Comprobado:** `npm run build`, `npm run test:db` y `npm run test:pedidos` pasan.

Siguiente: Compras 1 — Compras integrado a la app.

---

## 2026-10-20 · Plan: Compras en tres partes antes de la Fase 4

**Qué se hizo** (solo documentos, en el PR de la Fase 2):
- `PLAN-JARA-APP.md`: se reemplazan las fases 6a y 6c por tres, todas con Opus y conversación nueva:
  - **Compras 1 – Compras integrado a la app:** reemplaza la pantalla "Llega el 19 de octubre"; los pedidos se ven y se crean desde la app con cuenta, con tópico (Fondo, 20 años, General); el link sin cuenta sigue funcionando sobre los mismos datos.
  - **Compras 2 – Fondo:** ítems del presupuesto, respaldos con archivos privados, honorarios del entrenador, panel y permisos solo para el equipo del fondo.
  - **Compras 3 – Rendiciones:** hoja tipo Anexo N°1 y registro de rendiciones presentadas.
- Orden nuevo: Fase 3 → Compras 1 → Compras 2 → Compras 3 → Fase 4 → hito 28/10 → Fase 5 → Fase 6b → Fase 7 → Fase 8.
- Sin fechas intermedias: solo quedan los hitos 28/10 y 21/11. Se sacaron las fechas límite de las fases 4 y 8.
- **El equipo del fondo empieza a usarlo solo cuando estén cerradas las tres.**
- **Requisito de Compras 2:** las respuestas de la reunión del fondo del 20/10 se anotan aquí, en la bitácora, antes de partir.
- **Migraciones:** la de Compras 2 la revisan el administrador de la app y Hacienda antes de aplicarla; la de la Fase 6b la revisa el administrador de la app.

**Pendiente para la Fase 8 (pulido):** las sugerencias de día de Entrenamiento (los botones de sugerencia del formulario de la lista) se dejan como están por ahora; se revisan en el pulido.

Siguiente: Fase 3 — Ingreso a prueba de celulares.

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
