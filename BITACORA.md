# Bitácora de Jara App

Registro de lo hecho, fase por fase. Lo más nuevo va arriba. Sin nombres, correos ni datos personales de socios: se habla de roles. El plan vigente está en `PLAN-JARA-APP.md`.

---

## 2026-11-04 · Tabla de posiciones y fechas del campeonato

**Para qué:** que cualquiera vea "cómo vamos" en la liga de cada plantel y las fechas que vienen, sin salir de la app.

**De dónde salen los datos:** se revisaron las páginas de las ligas. La de los planteles del sábado publica la tabla, las fechas y los goleadores como imágenes, y la del jueves arma todo con JavaScript desde su servidor, sin una forma pública de leerla. Por eso no se importa sola: el encargado la copia en la app.

**Qué se hizo** (migración `0026_tabla_posiciones.sql`, se corre antes del merge):
- **Partidos > Tabla de posiciones** (`/tabla`): una tabla por plantel (PJ, G, E, P, GF, GC, DG, Pts; GF y GC se esconden en pantallas angostas), con el Jara destacado, "El Jara va 2º de 8, con 15 puntos", la fecha de actualización y el link a la página de la liga.
- **Actualizar la tabla:** el encargado del plantel (o un administrador) pega la tabla como texto, una línea por equipo ("Equipo 9 6 2 1 20 8 20"), ve cómo queda y la guarda. La base revisa los números y que solo una fila sea el Jara. Las cuentas de prueba solo miran.
- **Próximas fechas** del plantel en la misma pantalla y **Cargar varias fechas de una vez:** se pegan las fechas ("14/11 Rival" o "21/11 09:00 Rival") con campeonato, citación y cancha comunes, y se crean como partidos normales (`partido_guardar`, sin cambios en la base). No repite un día que ya tiene partido. Los cambios por suspensión o de día se corrigen en cada partido, como siempre.
- Archivos nuevos `src/lib/tabla.js`, `src/pages/Tabla.jsx` y `supabase/tests/tabla.mjs` (20 pruebas, entra en `npm run test:db`); ruta en `App.jsx`, botón en `Partidos.jsx` y estilos `posiciones-` al final de `styles.css`.

**Comprobado:** `npm run build` y `npm run test:db` pasan (también con la 0025 del PR #28 antes). Pantallas revisadas en modo demostración a 375 px, sin scroll horizontal ni errores. Falta probar con la base real.

---

## 2026-11-04 · Ingreso con correo y contraseña

**Para qué:** hasta ahora se entraba solo con Google o con un link/código al correo cada vez. Los tesoreros pidieron poder entrar con correo y contraseña quienes no usan Google.

**Qué se hizo** (sin migración ni cambios en la base):
- **Ingreso:** Google arriba y, abajo, correo + contraseña (con "Mostrar contraseña"). Un enlace lleva al link/código de siempre: "¿Primera vez o se te olvidó la contraseña? Entra con un link".
- **Crear y recuperar la contraseña son el mismo camino:** quien pide un link o código queda marcado (un día, en el navegador) y, al entrar, la app le ofrece "¿Dejamos una contraseña?" antes de seguir. Puede saltarlo con "Ahora no". Se usa el mismo correo de siempre; no hace falta otra plantilla ni registro aparte.
- **Más > Mi contraseña:** crear o cambiar la contraseña en cualquier momento, también para quien entra con Google.
- Mínimo 8 caracteres, revisado en la app; los errores de Supabase salen en español.
- Cambios en `src/lib/sesion.jsx` (`entrarConClave`, `ponerClave`, `ofrecerClave`), `src/pages/Ingreso.jsx`, `src/pages/ElegirClave.jsx` (nueva), `src/components/FormClave.jsx` y `src/components/MiClave.jsx` (nuevos), `App.jsx`, `Mas.jsx` y estilos. En modo demostración se ven en `/ingreso` y `/clave`.

**En Supabase (opcional, lo hace el administrador):** el proveedor Email ya está activo y cubre contraseñas. Se recomienda subir el largo mínimo a 8 (Authentication > Providers > Email). "Secure password change" puede quedar como esté: si está prendido y la sesión tiene más de un día, la app pide volver a entrar con un link antes de cambiar la contraseña desde Más.

**Comprobado:** `npm run build` y `npm run test:db` pasan. Pantallas revisadas en modo demostración a 375 px, sin scroll horizontal ni errores. Falta probar con la base real y en celulares.

**Ojo:** si el link del correo se abre en otro navegador (por ejemplo, dentro de la app de Gmail), la oferta no aparece; para eso está Más > Mi contraseña.

---

## 2026-11-04 · Apodo en todos lados

El apodo (0024) sale chico, en cursiva y dorado al lado del nombre real también en la asistencia de cada partido, las listas de entrenamientos y la ficha y la lista de cobros de Tesorería. Solo frontend, sin migración.

---

## 2026-11-04 · Fase 5 (ajuste) — El perfil se alimenta desde Tesorería, y apodo

**Por qué:** al probar el piloto, el administrador pidió que el nombre, el celular y el correo que carga el tesorero alimenten el perfil del jugador (y que el jugador no los edite), y que cada uno pueda tener un apodo.

**Qué se hizo** (migración `0024_perfil_y_apodo.sql`, se corre antes del merge):
- En la ficha de Tesorería se editan nombre completo, apodo, celular y correo, y van directo a `personas` / `persona_contactos`. El jugador no los puede cambiar (las tablas siguen cerradas desde la 0018).
- **Correo:** si el jugador no tenía, el del tesorero pasa a ser con el que entra a la app; si ya tenía, no se toca y el nuevo queda solo para cobrar. No se copia un correo que use otra persona.
- El celular guardado aparte en la 0023 pasa al perfil.
- **Apodo** (`personas.apodo`, máx. 20): cada jugador lo pone en Más > Tu apodo; sale chico al lado del nombre real ("Nombre · apodo") en Jugadores (estadísticas), goleadores del partido y la lista de Tesorería.
- Tesorería avisa cuando se entra en modo solo mirar (cuentas de prueba).

**Comprobado:** `npm run build`, `npm run test:db` (con 14 pruebas nuevas en `supabase/tests/tesoreria.mjs`) y `npm run test:pedidos` pasan. Pantallas revisadas en modo demostración a 375 px.

---

## 2026-11-04 · Fase 5 (primera versión) — Tesorería de cada plantel

**Para qué:** que el tesorero de un plantel deje su planilla y lleve cuotas, pagos, cobros y caja en la app. Sale de la reunión con los tesoreros del 3/11; parte con un plantel de piloto y su feedback guía al resto.

**Qué se hizo** (migración `0023_tesoreria.sql`, la revisan y la corren el administrador de la app y Hacienda antes del merge):
- **Plan de cuotas por plantel y temporada**, editable: una fila por cuota (inscripción, marzo…) con vencimiento y monto, más el % de aporte al club. Cada plantel cobra distinto y el monto puede cambiar mes a mes.
- **Condición de cada jugador:** normal (con descuento opcional), beca %, exento o monto especial (por cuota mensual, sin inscripción); deuda de la temporada anterior; celular y correo **para cobrar** (no tocan el correo con que se entra a la app); comentario; "juega esta temporada".
- **Cargos extra** (polera, asado, rifa) a varios jugadores de una vez; **pagos** con fecha, medio y nota, que se anulan con registro de quién (no se borran); **caja** del plantel con ingresos y egresos, pagados o programados.
- **Lo que se debe no se guarda:** se calcula en `src/lib/tesoreria.js` (plan × condición + extras + deuda anterior − pagos, aplicando los pagos de lo más antiguo a lo más nuevo). La misma cuenta sirve al tesorero y a "Mi cuota".
- **Permisos:** tesorero (`persona_equipos.rol = 'tesorero'`) ve y edita solo su plantel; Hacienda y administradores, todos; tesorero y Hacienda de prueba solo miran; cada jugador ve solo lo suyo con `mi_tesoreria()`. Las tablas no se leen desde el navegador. El tesorero puede sumar a la tesorería a alguien de la nómina sin cambiar los planteles del club.
- **App:** `/tesoreria` (Más > Tesorería) con Jugadores (ficha, registrar pago, condición), Cobrar (un correo con copia oculta a los deudores y WhatsApp con el detalle de cada uno), Cuotas (armar el plan rápido o cuota a cuota) y Caja. "Mi cuota" deja de ser maqueta. El tablero de ejemplo se oculta a quien ya tiene tesorería real.

**Comprobado:** `npm run build`, `npm run test:db` (34 + 174 + 51 + 37 nuevas en `supabase/tests/tesoreria.mjs`) y `npm run test:pedidos` (274) pasan. Pantallas revisadas en modo demostración a 375 px, sin scroll horizontal ni errores.

**Queda para después:** pago dentro de la app con pasarela (registro automático), correo desde una casilla de tesorería del club, recordatorios automáticos por fecha, importar planillas, RUT y fecha de nacimiento.

---

## 2026-11-03 · Fase P — "Ver como" para cuentas de prueba

**Para qué:** probar la app desde distintos roles con una cuenta de prueba, cambiando de rol **dentro de la app**. Supabase se toca una sola vez por cuenta, para darle su lista de roles; quien prueba nunca entra a Supabase.

**Qué se hizo** (migración `0022_ver_como.sql`, la revisa y la corre el administrador de la app antes del merge):
- `personas.prueba_roles` (lista de roles que la cuenta puede elegir; null = cuenta normal) y `personas.prueba_rol` (el rol actual). La lista se pone solo por SQL: ninguna función la escribe y las tablas no se tocan desde el navegador.
- `prueba_ver_como(rol, plantel)`: falla si la cuenta no es de prueba o si el rol no está en su lista. Apaga todo (permisos, áreas y planteles de esa misma persona) y prende solo el rol elegido. Roles: socio, equipo del fondo, Hacienda, anota partidos, entrenamientos (administra y cobra), tesorero de un plantel y comunicaciones. Administrador no existe como rol de prueba.
- **Hacienda de prueba es solo mirar:** ve Compras como Hacienda y el fondo, pero la base rechaza aprobar, devolver, entregar, subir o abrir comprobantes, editar, eliminar, corregir compras ajenas, cerrar tópicos y cualquier cambio en el fondo. Para eso `puedo_aprobar_compras()` (la que piden todas las acciones) excluye a las cuentas de prueba, y la pantalla usa `puedo_mirar_hacienda()`.
- **En ningún rol** una cuenta de prueba es administradora (regla en la tabla), abre comprobantes de transferencia, presenta una rendición ni la marca como subida.
- Permiso nuevo `personas.edita_comunicaciones` para el módulo de Comunicaciones (todavía ninguna función lo usa).
- `mi_persona()` suma `prueba` (roles, rol actual y planteles), `hacienda_solo_mirar` y `edita_comunicaciones`.
- **App:** en Más, solo para cuentas de prueba, la tarjeta "Ver como" con sus roles (tesorero elige plantel). Al elegir, la app se recarga. Arriba, en toda la app, una barra: "Cuenta de prueba · viendo como: Hacienda (solo mirar)".

**Comprobado:** `npm run build`, `npm run test:db` (34 + 174 + 51 pruebas nuevas en `supabase/tests/ver_como.mjs`, que aplica todas las migraciones en orden) y `npm run test:pedidos` (274) pasan. Tarjeta y barra revisadas en modo demostración a 375 px, sin scroll horizontal.

**Ojo:** las cuentas de prueba viven en el club real. Equipo del fondo de prueba puede pasar compras al fondo y marcar respaldos; anota partidos y entrenamientos escriben datos reales. Hacienda de prueba ve nombres y montos de las compras reales, por eso solo va en la lista del administrador.

Siguiente: Compras 3.

---

## 2026-11-02 · Comunicaciones — Ajustes de revisión de El Jara Informa

**Fotos mientras cargan otras:** antes, si se ajustaba el encuadre o el pie de una foto mientras se leían otras, al terminar la carga se volvía a la lista vieja y se perdía el ajuste. Ahora cada cambio se aplica sobre la lista vigente y ubica la foto por su id; cada foto se agrega apenas se lee, una foto dañada no descarta las demás y no se puede salir del editor (ni cerrar la pestaña sin aviso) con fotos cargando.

**Reemplazo del boletín anterior:** se quitó el boletín viejo de ejemplo (N°2 en formato de notas) y su numerador, que seguían apareciendo en Inicio. El catálogo se ordena por número: la edición más alta es la «última» y las demás pasan al historial.

**Pruebas reproducibles:** `npm run test:boletin` (modelo, sin navegador) y `npm run test:boletin:e2e` (Chromium con perfiles iPhone 13 y Pixel 7: catálogo, reemplazo, lector con botones, deslizamiento, ampliación y lectura móvil, editor con carga lenta simulada y recarga). El recorrido falla con el código anterior a este ajuste. Sigue pendiente probar en celulares físicos.

**Producción:** con la base real (sin modo demo) Noticias no muestra el catálogo ficticio ni abre sus ediciones: se ve el anuncio «Se viene El Jara Informa» hasta que exista publicación oficial. Decisión del administrador, 2 nov.

---

## 2026-11-02 · Comunicaciones — Editor y lector de El Jara Informa (demo)

**Qué se hizo:** catálogo ficticio propio en Noticias, separado de Cortita y al pie y Avisos. Editor local con múltiples borradores en IndexedDB, guardado automático y estado visible, duplicación, eliminación confirmada y respaldo/importación JSON. Cinco tipos de bloques, orden editable, agenda y fotografías originales con orden y encuadre ajustable. Sin Supabase ni publicación oficial.

**Periódico:** composición compartida por vista previa, lector y exportación PNG de 1280 × 1600 por página. Agrega páginas, continúa noticias entre oraciones y prefiere párrafos completos; las fotos no se dividen. Avisa y bloquea exportaciones si una palabra, oración, titular o pie no cabe. Lector con navegación, deslizamiento lateral, ampliación y lectura móvil del mismo contenido.

**Acceso en modo demo:** Noticias → El Jara Informa → Administrar ediciones demo (`/noticias?editor=1`). El catálogo abre el lector con «Leer edición» (`/noticias?edicion=demo-3`). También se accede al editor desde Publicar → Boletín. Los borradores nunca aparecen en el catálogo de los socios.

**Comprobado:** `npm run build` y `npm run test:db` pasan (34 + 174 pruebas). Recorridos en Chromium a 375 px: crear los cinco bloques, escribir, cargar dos fotos sintéticas, ajustar/restablecer encuadre, ordenar fotos y bloques, guardar, recuperar tras recargar y cerrar pestaña, duplicar, eliminar con confirmación, quitar bloques y respaldar/importar. Edición de prueba de cuatro páginas: descarga individual y cuatro PNG independientes, resolución comprobada. Lector: botones, deslizamiento, zoom y cambio de modalidad; sin desplazamiento horizontal de la página. Creación y lectura de entrevistas y avisos conservadas. Sin errores de JavaScript. Prueba de diez páginas con continuidad del texto y límites geométricos; bloqueos por palabra/oración excesiva y errores simulados de cuota e IndexedDB no disponible.

**Límites:** datos solo en este navegador; borrar su almacenamiento elimina los borradores. No editar la misma edición en varias pestañas. Hasta 20 MB y 40 megapíxeles por foto, 40 páginas por edición; PNG separados, con descarga individual si el navegador bloquea las múltiples. No se probó en dispositivos físicos iOS/Android. Publicación compartida y permisos reales quedan para el administrador. Sin dependencias nuevas.

**Compatibilidad:** rama propia desde `e4cf691`; no se modifican los PR #17, #18 ni #21. Solo se agrega esta entrada a la bitácora existente. Sin cambios en Inicio, App, Más, autenticación, áreas financieras ni Supabase.

---

## 2026-10-31 · Resultado del día visible al tiro

Un partido jugado hoy seguía como "próximo" hasta la medianoche aunque ya tuviera el resultado anotado, así que no aparecía en "Ya jugados" ni en el último resultado de Inicio. Ahora pasa a jugados apenas se anota el marcador (`src/lib/partidos.js`). Solo frontend, sin migración.

---

## 2026-10-30 · Anuncio del boletín

Noticias anuncia El Jara Informa cuando no hay publicaciones; Inicio también anticipa su llegada.

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

**Migración:** `0021_fondo.sql` corrida en Supabase el 3/11 y verificada (4 ítems, $3.087.500 aprobados, 2 rendiciones, 2 documentos, 3 cuotas, tópico activo, bucket privado y 14 funciones).

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
