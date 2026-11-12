# Bitácora de Jara App

Registro de lo hecho, fase por fase. Lo más nuevo va arriba. Sin nombres, correos ni datos personales de socios: se habla de roles. El plan vigente está en `PLAN-JARA-APP.md`.

---

## 2026-11-11 · Auditoría antes del lanzamiento: detalles

**Para qué:** segunda tanda de la auditoría, cosas chicas que se notan en el celular. Sin migración.

- **Botones más fáciles de tocar:** "Salir", los "‹ Volver", las pestañas de La liga, los filtros de Jugadores y los enlaces sueltos ("Reabrir", "Sumar un invitado") tienen un área de toque más alta.
- **Sin zoom en iPhone:** en pantallas táctiles todas las casillas de texto usan letra de 16px, así Safari no acerca la pantalla al escribir.
- **Partido ya jugado:** si nadie respondió, ya no queda una tarjeta vacía al final.
- **Pantallas que no son para ti:** Fondo, "Nuevo partido" y "Nueva lista de entrenamiento" muestran cómo volver. "Fotos de los partidos" le explica al socio que eso lo ve el encargado, en vez de mostrar un botón y un error.
- **Club:** la dirección `/club`, que seguía mostrando la pantalla en construcción, ahora lleva a Más.
- **Pases de ingreso:** el botón dice "Sí, aprobar".

**Comprobado:** `npm run test:db`, `npm run test:pedidos` y `npm run build` pasan. Medido en iPhone 13 emulado contra una base en memoria con todas las migraciones: no quedan botones bajo 36px de alto en las pantallas principales.

**Queda de la auditoría:** permisos sobrantes de `dorsales` y `perfiles` (migración aparte), el precio que ve un administrador sin plantel en Entrenar (es de la base) y partir el paquete de la app en trozos.

---

## 2026-11-11 · Auditoría antes del lanzamiento: primera impresión

**Para qué:** que el primer ingreso de los socios el 21 de noviembre salga limpio. Sale de la auditoría completa de la app (seguridad, primer ingreso, celular, textos); este PR trae lo que toca la primera impresión. Sin migración.

- **Más:** se esconden "Asambleas" y los ministerios, que abrían una pantalla en construcción con una fecha ya pasada. Vuelven al menú cuando su pantalla exista.
- **Red para errores** (`RedDeErrores.jsx`): si una pantalla falla al dibujarse, en vez de quedar todo en negro aparece "Algo falló" con "Volver a cargar" e "Ir al inicio".
- **¿Quiénes jugaron?:** el nombre completo se ve en dos líneas si hace falta; antes se cortaba y dos nombres parecidos se confundían.
- **Pantalla de entrada:** quien llega por primera vez ve Google y "Enviarme un link o código"; la contraseña queda a un toque. Quien ya entró con contraseña en ese aparato (o la creó) ve primero la contraseña (`src/lib/entrada.js`, solo recuerda la preferencia en el aparato). No toca `sesion.jsx`.
- **Espera del pase:** la pantalla "Casi listo" revisa sola cada 20 segundos y al volver a la app; apenas aprueban a la persona, entra sin apretar nada.
- **Bienvenida:** en Inicio, a quien no tiene foto ni posición se le invita a completar su perfil. Se va al completarlo o con "Ahora no".

**Comprobado:** `npm run test:db`, `npm run test:pedidos` y `npm run build` pasan. Probado en iPhone 13 y Pixel 7 emulados con la app conectada a una base en memoria con todas las migraciones: entrada, espera que entra sola al aprobar, bienvenida, menú Más, nombres al anotar y la red de errores.

**Queda de la auditoría:** detalles (botones chicos, zoom en iPhone, textos), quitar permisos sobrantes de `dorsales` y `perfiles` (migración aparte) y decisiones del administrador: si "Voy" en Inicio debe anotar también al tercer tiempo, y los textos del boletín (módulo Comunicación).

---

## 2026-11-11 · El Jara Informa: base para publicar ediciones (0050)

- Migración `0050_boletin_publicar.sql`: tabla `boletin_ediciones` y bucket privado `boletin` (fotos del borrador en `<edición>/fotos/`, páginas en `<edición>/v<versión>/pagina-NN.png`).
- Gestionan ediciones Comunicaciones y administradores (`gestiona_boletin()`), revisado en las funciones y en las reglas del bucket. Los socios ven solo lo publicado de su club.
- Funciones: `boletin_catalogo`, `boletin_ultima`, `boletin_edicion`, `boletin_guardar`, `boletin_crear_historica`, `boletin_publicar`, `boletin_retirar` y `boletin_eliminar`.
- Publicar revisa que estén todas las páginas antes de cambiar el estado. Guardar el borrador no cambia la copia que ven los socios. Solo se elimina un borrador o una edición retirada, escribiendo su número.
- Falta el lado de la app (botones Publicar, Retirar, Eliminar, Subir edición anterior, catálogo desde la base y tarjeta en Inicio), en un PR aparte del módulo Comunicación.

**Comprobado:** `npm run test:db` con el nuevo `supabase/tests/boletin.mjs` (44 pruebas).

---

## 2026-11-11 · Ajustes visuales del boletín

- La marca de demostración del PNG depende del entorno; se conserva el borrador importado sin cambiar sus contenidos.
- Se agregan tamaños separados para título e introducción de la sección en dos columnas y jerarquía legible en la lectura móvil. El botón indica que guarda un borrador local.

**Comprobado:** `npm run test:boletin` (23 pruebas), `npm run test:db` y `npm run build`. Pendiente prueba visual a 375 px y e2e: Chromium no está instalado en el entorno.

---

## 2026-11-11 · Compras: subir comprobante o boleta a una lista cerrada

- Causa: Storage solo dejaba subir archivos a la carpeta de una lista **abierta** (reglas de 0006 y 0017), pero Compras muestra también las solicitudes de listas cerradas. Hacienda veía "Entregar con comprobante" en una compra aprobada de una lista cerrada y el archivo se rechazaba con "No se pudo subir el archivo".
- Migración `0049_subir_a_lista_cerrada.sql`: a una lista cerrada (no archivada) de su club, Hacienda puede subir comprobantes y boletas, y quien pidió una compra con la plata entregada puede subir su boleta. Las listas abiertas siguen igual.
- La app corrige fotos sin tipo o en formatos que Storage no acepta (HEIF, GIF, AVIF...) pasándolas a JPEG, y el aviso de error ahora dice si fue el formato, el peso, el permiso o la conexión.

**Comprobado:** `npm run test:db` (8 pruebas nuevas de 0049), `npm run test:pedidos` y `npm run build` pasan.

---

## 2026-11-11 · Perfil del DT y partidos dirigidos

**Para qué:** que el DT y el ayudante técnico tengan perfil propio, con su rol y su récord, y no solo lo de un jugador.

**Qué se hizo** (migración `0048_perfil_dt.sql`, se corre antes del merge; toca el perfil, la revisa el administrador de la app):
- **Posición:** se suman "DT" y "Ayudante técnico", en un grupo aparte ("Cuerpo técnico") del editor. Es solo cómo se muestra: no da permisos. El permiso de votar MVP sigue siendo `cuerpo_tecnico` (0033), que se da por SQL.
- **Perfil del DT:** muestra su rol y los planteles que dirige ("DT · Senior Sábado"), esconde pie hábil y dorsal, y trae la ficha "Como DT": partidos dirigidos con G/E/P, rendimiento (puntos ganados de los posibles), goles a favor y en contra, vallas invictas, récord por plantel, goleador y jugador del partido más repetido en sus partidos, y los últimos 5 resultados. Este año o histórico. Si además jugó algún partido, sus números de jugador salen aparte.
- **¿Quién dirigió?:** al anotar el resultado aparece con el cuerpo técnico del plantel ya marcado; quien anota desmarca al que no estuvo. El cuerpo técnico ya no viene marcado en "¿Quiénes jugaron?" la primera vez.
- Partidos sin nadie marcado (los anteriores, o si se desmarca todo) cuentan como dirigidos para el cuerpo técnico del plantel: quien tiene `cuerpo_tecnico` o DT/Ayudante en su perfil y está en el plantel.
- Base: tabla `partido_tecnicos` (cerrada al navegador), funciones `partido_banca`, `partido_banca_guardar`, `dt_cifras` y `es_tecnico_de` (interna); `perfil_guardar` acepta las posiciones nuevas y `perfil_ver` agrega `cuerpo_tecnico` y `dirige`.
- Sin la 0048 corrida, la app sigue funcionando: no aparecen ¿Quién dirigió? ni la ficha del DT, y guardar DT como posición falla.

**Comprobado:** `npm run test:db` pasa (25 pruebas nuevas en `supabase/tests/dt.mjs`), `npm run test:pedidos` y `npm run build` pasan, y se revisó en modo demostración (iPhone 13): perfil del DT, editor y ¿Quién dirigió?.

---

## 2026-11-10 · Introducción para noticias en dos columnas

- Agrega un título y una introducción opcionales a ancho completo antes de las noticias, con negrita, cursiva y subrayado. Se muestran en el PNG y en la lectura móvil y admiten borradores anteriores.
- El texto de la sección permanece en su bloque al mover noticias. La última noticia no se puede trasladar a otro bloque mientras la sección tenga introducción, para no descartarla.
- Pendiente: la publicación para socios y la carga remota de ediciones históricas necesitan diseño y revisión del administrador de base de datos; este cambio no las implementa.

**Comprobado:** pruebas del boletín y compilación. La revisión en navegador móvil queda pendiente por la restricción de Chromium en este entorno.

---

## 2026-11-10 · El Jara Informa: distribución y ajuste de páginas

- El encabezado recorta el fondo negro exterior de la insignia original en el periódico y PNG.
- Las noticias de dos columnas permiten agregar, ordenar y trasladar noticias; se puede cambiar su formato conservando textos y fotos. Los borradores anteriores siguen admitidos.
- La vista previa propone compactar una página sin alterar el contenido de páginas anteriores; se puede revisar, aplicar o descartar, deshacer el último ajuste y marcar páginas listas. Las páginas posteriores pueden redistribuirse. Si no resulta, se informa para que se ordene manualmente.
- La vista previa se acerca al boletín al abrirse; los botones de vista previa por bloque y volver a editar están en el flujo de la página, sin tapar controles. El cierre usa cursiva tanto en lectura móvil como en el PNG.

**Comprobado:** `npm run test:boletin`, `npm run test:db` y `npm run build` pasan. Las pruebas de navegador y la revisión visual en celular quedan pendientes: Chromium no pudo iniciarse en este entorno por una restricción de sockets.

---

## 2026-11-10 · Compras 3: paso a paso del fondo, pedir el pago de honorarios y editor para Comunicaciones

**Para qué:** que el equipo del fondo sepa qué le toca sin preguntar, que Hacienda se entere cuando hay que pagarle al entrenador, y que Comunicaciones pueda armar el boletín en la app real.

**Qué se hizo** (migración `0047_honorarios_pedir_pago.sql`, se corre antes del merge; mueve plata, la revisan el administrador de la app y Hacienda):
- **Fondo > Paso a paso** (pestaña nueva, la primera): arriba "Lo que falta ahora", armado con los datos del fondo (compras por pasar, respaldos pendientes, honorarios por pedir o pagar, F29 por marcar, gastos listos para rendir), con un botón que lleva a la pestaña. Abajo, los pasos de una compra del fondo, de los honorarios de cada mes y de la rendición, y las reglas del reglamento. La pestaña muestra cuántas cosas faltan. `/fondo?v=honorarios` abre directo una pestaña.
- **Honorarios: pedir el pago.** Cada cuota muestra bruto ($212.500), retención 15,25 % ($32.406) y líquido a transferir ($180.094). El equipo del fondo sube la boleta, anota N° y fecha y aprieta "Pedir el pago a Hacienda" (puede avisar por WhatsApp o anular el pedido). Hacienda lo ve en Inicio ("Te toca pagar") y en la cuota sube el comprobante con "Ya transferí": queda pagada por transferencia y el comprobante cuenta como respaldo. Después sale el aviso del F29 del mes siguiente.
- Base: columnas `pago_pedido_en` y `pago_pedido_por` en `fondo_gastos`; funciones `fondo_honorario_pedir`, `fondo_honorario_anular`, `fondo_honorario_pagado` (solo Hacienda de verdad, ninguna cuenta de prueba), `fondo_honorarios_pedidos` y `honorarios_por_pagar` (para Inicio; a cualquier otra cuenta le devuelve vacío). La boleta tiene que estar subida, desde el 1 de octubre y no futura.
- **Editor del boletín en la app real** para quien tiene `edita_comunicaciones` (también con "Ver como" en Comunicaciones) y los administradores: botón "Abrir el editor del boletín" en Noticias. Los borradores siguen guardándose solo en ese aparato; nada se publica. Los socios siguen viendo "Se viene El Jara Informa".
- Sin la 0047 corrida, el fondo y la guía funcionan; solo falla el botón de pedir el pago.

**Comprobado:** `npm run test:db` pasa (30 pruebas nuevas en `supabase/tests/honorarios.mjs`), `npm run test:pedidos`, `npm run test:boletin` y `npm run test:boletin:e2e` pasan, `npm run build` pasa y se revisó en modo demostración (iPhone 13): pedir, pagar, aviso en Inicio y editor.

---

## 2026-11-09 · ¿Quién atajó? Goles recibidos de cada arquero

**Para qué:** los planteles a veces tienen dos arqueros que se turnan los partidos o juegan un tiempo cada uno. Cada uno tiene que tener sus números aparte.

**Qué se hizo** (migración `0046_quien_atajo.sql`, se corre antes del merge):
- Tabla `partido_arqueros` (cerrada al navegador) y funciones `partido_arco` (leer, con los arqueros del plantel para sugerir), `partido_arco_guardar` (anotar; solo quien anota resultados) y `arquero_cifras` (partidos al arco, goles recibidos, vallas invictas y lo de cada partido).
- Al poner o corregir el resultado aparece "¿Quién atajó?". Si jugó un solo arquero (por su perfil), viene marcado. Uno solo se lleva todos los goles en contra; con dos o más se anota cuánto recibió cada uno y tiene que sumar el total. El que atajó queda como que jugó.
- En el partido: "Al arco: X (recibió 1) y Y (valla invicta)".
- En el perfil: goles recibidos (con promedio) y vallas invictas, y en sus últimos partidos "recibió N" o "valla invicta". Aparece para quien atajó alguna vez o tiene "Arquero" en su perfil.
- Partidos anotados antes, sin arquero marcado: se le cuentan a quien tenga "Arquero" como posición y haya jugado.
- Sin la 0046 corrida, la app funciona igual y no muestra nada de esto.

**Comprobado:** `npm run test:db` pasa (15 pruebas nuevas en `charla.mjs`), `npm run build` pasa y se revisó en modo demostración (iPhone 13).

---

## 2026-11-09 · Estadísticas en el perfil del jugador
- El perfil de cada jugador (el propio y el de otros) muestra una tarjeta "Estadísticas": partidos jugados, goles, asistencias, veces jugador del partido y tarjetas, con "Este año" e "Histórico".
- Si la cifra lo deja entre los 10 primeros del club, dice el puesto ("3º del club"); si no, los goles muestran el promedio por partido.
- Si juega en más de un plantel, desglosa sus números por plantel. Abajo, sus últimos 5 partidos con resultado, con su aporte (goles y asistencias) y enlace al partido.
- Sale de las mismas funciones que la tabla de Jugadores (`estadisticas` y `mvp_conteo`).
- Componente nuevo `src/components/EstadisticasJugador.jsx`; en `Perfil.jsx` solo se agrega la tarjeta.

**Comprobado:** `npm run build` pasa y se revisó en modo demostración (iPhone 13).

---

## 2026-11-09 · Las fotos encontradas, también en el perfil del jugador

**Para qué:** al entrar al perfil de otro jugador solo se veían sus datos. Ahora se ven también las fotos de la liga donde sale, si él lo eligió.

**Qué se hizo** (migración `0045_fotos_en_el_perfil.sql`, se corre antes del merge):
- `caras_personas.muestra` (apagado por defecto): quien ya había activado "Buscarme en las fotos" con el aviso "solo tú ves tus fotos" sigue privado hasta que lo cambie.
- `caras_mostrar` lo prende o lo apaga; `caras_fotos_de` entrega las fotos de un jugador del club solo si él eligió mostrarlas. Nunca las escondidas con "No soy yo".
- En Mis fotos: al activar, una casilla "Mostrar en mi perfil las fotos donde salgo" (marcada) y después un enlace para mostrarlas u ocultarlas.
- En el perfil de otro jugador: tarjeta "En las fotos de la liga" con la grilla y el visor (con el link al partido, sin "No soy yo"). Si no muestra fotos, no aparece nada.

**Comprobado:** `npm run test:db` pasa (pruebas nuevas en `caras.mjs`: privado por defecto, otro club no ve, las escondidas no salen) y en demostración con el navegador.

---

## 2026-11-09 · Tabla del jueves: la fase con partidos jugados

**Para qué:** el 9 de noviembre la liga del jueves abrió en copafacil una fase nueva (14 equipos, sin partidos). La app tomaba siempre la fase más nueva, así que la tabla del Senior Jueves quedó con todos en 0 puntos.

**Qué se hizo** (migración `0044_tabla_jueves_fase_jugada.sql`, se corre antes del merge): `tabla_desde_copafacil` usa la fase más nueva que ya tenga partidos jugados. Cuando la fase nueva tenga partidos, la tabla pasa sola a esa.

**Comprobado:** `npm run test:db` pasa (2 pruebas nuevas en `liga.mjs`) y `npm run build` pasa.

---

## 2026-11-09 · Buscar caras: bajar las fotos por la miniatura

La primera vuelta real de "Buscar caras" sacó la huella pero no pudo bajar 376 de las 452 fotos por la API del Drive. Ahora la tarea baja primero la misma miniatura pública que muestra la app (2000 px, sin gastar cuota) y usa la API solo si eso falla. El registro anota el parecido más alto visto y por qué falló cada descarga (solo códigos, sin datos de personas). Las fotos que no se pudieron bajar quedan pendientes y se revisan en la vuelta siguiente. Sin migración.

**Comprobado:** el script contra un servidor de mentira (una foto por miniatura, otra por la API, una que falla en ambas).

---

## 2026-11-09 · La liga del sábado, desde cof.cl

**Para qué:** la tabla del Senior Sábado seguía con 4 partidos jugados. La liga cambió su página a cof.cl y Deporstar dejó de estar al día: no tenía el resultado del 7 de noviembre, mientras cof.cl ya mostraba 5 jugados.

**Qué se hizo** (migración `0043_sabados_desde_cof.sql`, se corre antes del merge):
- `liga_torneos` acepta una tercera fuente: `fuente = 'cof'` con `cof_torneo` (por ejemplo `senior-segunda-clausura`).
- cof.cl es una página Next.js que trae sus datos dentro del mismo HTML. `liga_desde_cof` junta esos pedazos y saca la lista de torneos; `partidos_desde_cof` y `tabla_desde_cof` dejan los partidos y la tabla de un torneo en la misma forma que las otras fuentes. El número de fecha sale del nombre ("Fecha 7"), porque la página se salta las fechas suspendidas.
- `liga_refrescar` trae en un solo pedido las fechas, los resultados y la tabla. Borra las fechas y partidos que ya no están (los de Deporstar, al cambiar). La tabla queda en la pestaña que ya tenía el plantel, marcada como conectada.
- Un partido de la app enlazado a un partido de la liga que ya no existe se vuelve a enlazar en vez de crear otro.
- Para conectar los planteles del sábado, el administrador de la app corre un `update` en `liga_torneos` (fuera del repo).

**Comprobado:** `npm run test:db` pasa (21 pruebas nuevas en `liga.mjs`, con el torneo real del Senior en `supabase/tests/fixtures/cof-senior.json`, sin escudos) y `npm run build` pasa. La lectura se probó también con la página completa de cof.cl.

---

## 2026-11-09 · Buscarme en las fotos (reconocimiento facial con permiso)

En Perfil > Mis fotos, cada uno puede activar "Buscarme en las fotos": declara tener 18 o más, y una tarea de GitHub (`.github/workflows/caras.yml`, cada 3 horas, gratis) saca una huella de su cara desde la foto de perfil y la compara con las fotos de la liga ya enlazadas (0041). Motor: InsightFace/ArcFace (código abierto, CPU). Solo se guarda "esta foto tiene a esta persona"; de las demás caras no se guarda nada. Apagarlo borra la huella y lo encontrado; "No soy yo" esconde una foto. Migración `0042_buscarme_en_fotos.sql`; la tarea entra con la clave secreta de Supabase (secreto `SUPABASE_SECRET` en GitHub) y no imprime datos de personas (los registros del repo son públicos).

**Prueba previa** (con permiso del jugador, fotos borradas después): en 11 fotos de un partido lo encontró solo donde aparece, con 0,62 de parecido contra menos de 0,10 de los demás. Un motor más liviano para el navegador (Human) no distinguía, por eso corre en GitHub.

**Comprobado:** `npm run test:caras` (25 pruebas: permisos, menores, apagar borra todo, releer el Drive no pierde lo encontrado), `npm run test:db`, `npm run build`, el script contra un servidor de mentira con fotos de ejemplo de InsightFace, y el recorrido en modo demostración.

---

## 2026-11-09 · Fotos: crear los partidos antiguos desde sus carpetas

La primera búsqueda real encontró muchas carpetas de partidos anteriores a la app (Apertura y principios del Clausura), que no tenían partido donde enlazarse. En Más > Fotos de los partidos, cada carpeta sin partido ofrece "Crear el partido" (jugado, con el rival, el día de las fotos y el torneo de la ruta; Jr → Junior, Sr → el Senior que juega ese día de la semana) y un botón para crear todos de una vez. Usa `partido_guardar`, así que lo puede hacer el capitán de ese plantel o un administrador. Sin migración.

**Comprobado:** `npm run build`, `npm run test:fotos-drive` y recorrido en modo demostración (crear todos y uno por uno) sin errores.

---

## 2026-11-09 · Fotos de cada partido, desde el Drive del fotógrafo de la liga

**Para qué:** las fotos de los partidos están en el Drive del fotógrafo de la liga (`Junior Clausura / Fecha 7 / Rival vs Hugo Jara Jr`) y llegan el martes o miércoles después del partido. Ahora aparecen solas en cada partido, sin copiarlas.

**Qué se hizo** (migración `0041_fotos_de_partidos.sql`, se corre antes del merge, y la llave de Google se carga por SQL):
- **La base revisa el Drive** con la extensión `http` (como "Actualizar la liga"): `fotos_revisar` recorre el Drive de a 5 pedidos por llamada, guarda las carpetas del club (`fotos_carpetas`: rival y categoría del nombre, día de las fotos) y la lista de fotos (`fotos_archivos`). La app la llama al abrir un partido jugado; la base solo sale al Drive si pasaron 6 horas. "Buscar fotos nuevas" la fuerza (capitán cuando quiera, el resto cada 5 minutos).
- **Se enlaza sola** la carpeta que calza con un solo partido jugado de su categoría a ±1 día de las fotos. Las demás quedan en Más > Fotos de los partidos para que el capitán confirme (la app propone el partido más parecido). Si el capitán quita una, no se vuelve a enlazar sola.
- **La llave de Google** vive en `fotos_drive` y nunca sale de la base. Sin llave, el capitán puede pegar el link de la carpeta en el partido.
- **Galería en cada partido:** grilla de miniaturas (9 y "Ver las N fotos") y visor con anterior/siguiente, deslizar y "Abrir en Drive". Las miniaturas salen del Drive público, sin llave. Se adelantó la galería de la Fase F por la presentación; se avisa al carril de Comunicaciones.

**Comprobado:** `npm run build`, `npm run test:db` (30 pruebas nuevas en `fotos.mjs`, con un Drive de mentira), `npm run test:fotos-drive` (6 del detector) y recorrido en modo demostración a 390 px sin errores. No se probó contra el Drive real (falta la llave): las miniaturas del Drive se ven recién en producción.

---


## 2026-11-07 · Comunicaciones — Encuadre y presentación del boletín

- Encuadre táctil sobre la foto completa, alternativa de mostrarla completa y controles precisos; se conserva el encuadre en la lectura móvil y el PNG.
- Encabezado inspirado en las ediciones previas; fuente de edición, tamaños y alineación de noticias, categoría y negrita/cursiva/subrayado de texto seleccionado. La revisión ortográfica depende del navegador y su diccionario.
- Bloques de frase destacada, cierre y agenda con actividades. Los borradores anteriores se conservan compatibles.
- Comprobado: compilación y 16 pruebas del boletín, incluidas geometría de recorte, formato, continuidad y respaldo. Pendiente validar gestos, formato y distribución en navegador real y dispositivos físicos: Chromium no pudo iniciar por la política de sockets del entorno. Las fuentes del sistema pueden variar entre dispositivos.

---

## 2026-11-07 · Comunicaciones — Mejoras del editor de El Jara Informa

- Vista previa accesible desde un botón flotante; el regreso conserva la posición del editor. Se espera la carga de fotografías antes de cambiar de vista.
- Selección visual de bloques y de seis formas de ubicar la primera foto junto al texto; las fotos adicionales quedan al final. Opción para intentar mantener la noticia y sus fotos juntas, con aviso si deben continuar.
- Compatibilidad con borradores anteriores y el mismo diseño en la vista de periódico y sus PNG. La lectura móvil mantiene el contenido legible en una columna.
- Comprobado: compilación y pruebas automáticas del boletín, incluidas posición, agrupación, continuidad, dos columnas y respaldos anteriores. Pendiente recorrido visual en navegador y celulares físicos: el entorno de pruebas no permite iniciar Chromium.

---

## 2026-11-07 · La liga: "Última actualización" y sin cargar fechas a mano

**Qué se hizo** (sin migración):
- Debajo de "Actualizar la liga" ahora se lee "Última actualización: hoy a las…". Es la última vez que se revisó la liga, de cualquier plantel, ya sea porque alguien apretó el botón o porque la app la revisó sola. Lo ve todo el club, no solo quien puede actualizar.
- Se saca "Cargar varias fechas de una vez" de la tabla: las fechas llegan solas desde la liga. También se borran el lector de fixture pegado (`leerFixture`) y `crearPartidoSuelto`.
- `cuando()` pasa a `src/lib/fechas.js` para usarlo en La liga y en la tabla.
- Para borrar la pestaña vieja de la tabla del jueves (la del pantallazo) basta un `delete` en `tablas_posiciones`. Lo corre el administrador de la app.

**Comprobado:** `npm run build` pasa. En modo demostración se ve la línea de última actualización bajo el botón.

---

## 2026-11-07 · La liga del jueves, automática desde copafacil

**Para qué:** el Senior Jueves juega en una liga que publica en copafacil. Hasta ahora su tabla se cargaba con pantallazo y no tenía fechas. Los datos de copafacil son públicos (una base Firebase), así que el jueves puede quedar igual que el sábado.

**Qué se hizo** (migración `0039_liga_desde_copafacil.sql`, se corre antes del merge):
- `liga_torneos` acepta una segunda fuente: `fuente = 'copafacil'` con `copafacil_torneo` (evento@torneo). `deporstar_torneo` deja de ser obligatorio. Las fechas de copafacil tienen números largos, así que `jornada_id` pasa a `bigint`.
- `liga_desde_copafacil` lee los partidos y `tabla_desde_copafacil` la tabla, a partir de la línea que copafacil guarda en cada equipo.
- `liga_refrescar` trae de una vez cuatro archivos: partidos, equipos, fechas y canchas. Con ellos guarda fechas y resultados, crea los partidos del Jara que vienen y deja al día dos tablas, la del grupo del Jara y la general. Esas dos tablas reemplazan a las del pantallazo. Igual que en el sábado, espera 3 horas entre una revisión y la siguiente.
- `tablas_posiciones()` marca como conectadas las tablas de un plantel que viene de copafacil.
- Partidos contra "Cupo Libre" (la fecha libre) no se muestran. copafacil omite los goles en cero, así que un partido terminado sin un dato de goles cuenta 0.
- App: el botón "Actualizar la liga" pide aparte solo las tablas de Deporstar, porque las del jueves llegan junto con las fechas. Al entrar a La liga también se recargan las tablas.
- Para conectar el plantel se usa un `insert` en `liga_torneos` con el torneo del jueves. Lo corre el administrador de la app.

**Comprobado:** `npm run test:db` pasa (17 pruebas nuevas en `liga.mjs`, con datos reales del jueves en `supabase/tests/fixtures/copafacil-jueves.json`) y `npm run build` pasa.

---

## 2026-11-06 · La liga: un solo botón y en Inicio solo el partido que viene

**Qué se hizo** (sin migración):
- Inicio muestra solo el partido que viene de cada plantel propio. El de la fecha siguiente aparece cuando pasa este.
- Un partido deja de ser "próximo" dos horas después de su hora de inicio (antes era al terminar el día), o en el acto si ya tiene resultado.
- Un solo botón "Actualizar la liga", al lado del título, trae las fechas y las tablas conectadas. Se sacan los botones sueltos de Fechas y de Tabla.

**Comprobado:** `npm run build` pasa. En el navegador (modo demostración) se ven el botón junto al título y un solo partido en Inicio.

---

## 2026-11-06 · La liga: fechas jugadas y por jugar, traídas desde Deporstar

**Para qué:** la liga de los sábados publica todas sus fechas en Deporstar (la página nueva de la liga usa esos mismos datos). La idea es ver ahí los partidos jugados y los que vienen, y no tener que programar a mano los partidos del Jara.

**Qué se hizo** (migración `0038_fechas_de_la_liga.sql`, se corre antes del merge):
- "Partidos" pasa a llamarse **La liga**, con tres pestañas: Partidos (los del Jara, con voy / no voy), Fechas (todos los partidos del campeonato: lo que viene y los resultados) y Tabla. `/tabla` lleva a la pestaña Tabla.
- La base trae la lista de fechas (JSON de Deporstar) y lee los partidos de cada fecha desde su página (día, hora, cancha, equipos y resultado), de a 3 páginas por vez, cada 3 horas al abrir la app. Quien anota partidos puede actualizar en el acto.
- Un torneo de Deporstar mezcla 1ª y 2ª División: se muestra solo la división donde juega el Jara.
- Los partidos del Jara que vienen quedan creados solos en la app (rival, día, hora, cancha y "Fecha N"). Si ya había uno ese día, se usa ese. Si la liga cambia la hora o la cancha, se actualiza mientras no tenga resultado.
- Pruebas: `supabase/tests/liga.mjs` (26), con un pedazo real de la página de una fecha en `supabase/tests/fixtures/`.

**Comprobado:** `npm run build` y `npm run test:db` pasan. En el navegador (modo demostración, ancho de celular) se ven las pestañas y las fechas.

---

## 2026-11-06 · Tabla: la app sabe sola si es el grupo o la general, y dice cuándo se actualizó

**Qué se hizo** (sin migración):
- Ya no se escribe el nombre de la pestaña. Si el pantallazo dice "GRUPO A", va a Grupo A; si no, es la general (salvo que ya haya un grupo con la misma cantidad de equipos y la general tenga más). Antes de guardar se muestra "Es la tabla del Grupo A (8 equipos): reemplaza la que había".
- Las pestañas van primero los grupos y al final la general.
- Arriba de la tabla: "Última actualización: hoy a las 18:05" (o ayer, o la fecha).

**Comprobado:** `npm run build` y `npm run test:captura` (prueba nueva de la elección de pestaña) pasan. En el navegador, subir los dos pantallazos del jueves deja Grupo A y General.

---

## 2026-11-06 · Las dos tablas del jueves y quién las carga

**Para qué:** al subir los dos pantallazos (grupo y general) quedaba una sola tabla, y la tabla solo la podía cargar el encargado del plantel.

**Qué se hizo** (migración `0037_tabla_la_carga_quien_anota.sql`, se corre antes del merge):
- Arreglo: en la lectura por columnas, el "GRUPO A" está antes de la fila de títulos y no se veía, así que el pantallazo del grupo también quedaba como "General" y reemplazaba a la otra. Ahora cada uno va a su pestaña.
- Bajo el nombre de la pestaña se dice si la reemplaza o si queda como pestaña nueva.
- La tabla la cargan, actualizan y borran también quienes anotan partidos (`puedo_anotar`); las cuentas de prueba siguen solo mirando.
- Pruebas: 4 nuevas en `supabase/tests/tabla.mjs` y una en `tests/captura.test.mjs`.

**Comprobado:** `npm run build`, `npm run test:db` y `npm run test:captura` pasan. En el navegador, subir el pantallazo del grupo y el de la general deja las dos pestañas.

---

## 2026-11-06 · Pantallazo de la tabla: lectura por columnas

**Para qué:** con la página al 50% los números quedan chicos y la lectura de la línea entera se equivocaba ("11" salía "1", "9" salía "e)") y hasta perdía un equipo.

**Qué se hizo** (sin migración):
- Se busca la fila de títulos (PTS J G E P GF GC DIF %) y cada columna se lee por separado y solo con dígitos; cada número va a la fila del equipo que está a su altura.
- Lo que falte se completa con la lectura de la línea o con las cuentas (PJ = G + E + P, Pts = 3G + E, GF − GC = DIF). Si no se encuentran los títulos, queda la lectura de antes.
- Se limpian siglas del escudo antes del nombre ("TEN Hugo Jara" → "Hugo Jara").

**Comprobado:** en el navegador, con los cuatro pantallazos reales (escritorio grupo y general, celular normal y celular al 50%), todas las filas salen exactas. `npm run build`, `npm run test:db` y `npm run test:captura` pasan.

---

## 2026-11-06 · Tabla del jueves: pantallazo del celular y editor más simple

**Para qué:** en el celular copafacil muestra solo PTS J G E P y el pantallazo no se leía. Además, el editor tenía demasiados campos para lo que se usa hoy (sábados conectados a Deporstar, jueves con foto).

**Qué se hizo** (sin migración):
- La lectura entiende la tabla del celular (sin goles). Si el pantallazo trae varios grupos, se queda con el del Jara. Si la tabla guardada tenía goles y el pantallazo no, avisa antes de guardar (mejor la página al 50% o el teléfono horizontal).
- Si ninguna fila trae goles, la tabla no muestra GF, GC ni DG, y al encargado le aparece un aviso: para la tabla completa, achicar la página de la liga al 50% y sacar el pantallazo de nuevo.
- Un solo botón, "Actualizar con un pantallazo": se elige la imagen, la app la lee, muestra cómo queda y en qué pestaña se guarda ("GRUPO A" → Grupo A; si no dice grupo, General). Ya no hace falta "Agregar otra tabla".
- El cuadro para escribir a mano y las opciones de la liga (campeonato, link, número de Deporstar) quedan escondidos en "Corregir a mano" y "Más opciones".

**Comprobado:** `npm run build`, `npm run test:db` y `npm run test:captura` (prueba nueva con el pantallazo del celular) pasan. Probado en modo demostración con el pantallazo real.

---

## 2026-11-06 · Tabla del jueves desde un pantallazo, con pestañas Grupo A y General

**Para qué:** la liga del Senior Jueves (copafacil) no entrega la tabla como datos, y copiarla a mano cada fecha es lento. Además publica dos tablas: la del grupo y la general.

**Qué se hizo** (migración `0036_varias_tablas_por_plantel.sql`, se corre antes del merge):
- Un plantel puede tener varias tablas, cada una con su nombre, y se ven con pestañas sobre la tabla. Con una sola tabla no aparece pestaña (los sábados quedan igual, conectados a Deporstar).
- "Subir un pantallazo de la tabla" en el editor: la app agranda la imagen, la pasa a blanco y negro y la lee con Tesseract en el mismo teléfono (sin llaves ni costo; la imagen no sale del teléfono). Llena el cuadro de texto para revisar antes de guardar. Entiende el orden de copafacil (Pts J G E P GF GC DIF %) y el de siempre, limpia lo que lee de los escudos, usa los nombres ya cargados para corregir los mal leídos, toma "GRUPO A" como nombre de la pestaña y avisa si una fila no cuadra (PJ = G + E + P, Pts = 3G + E).
- Botones "Agregar otra tabla" y "Borrar esta pestaña" para el encargado.
- Pruebas: 11 nuevas en `supabase/tests/tabla.mjs` y `tests/captura.test.mjs` (lectura de dos pantallazos reales, `npm run test:captura`).

**Comprobado:** `npm run build`, `npm run test:db` y `npm run test:captura` pasan. Probado en modo demostración con el pantallazo de la tabla general: las 16 filas salen bien.

---

## 2026-11-05 · Cómo va la votación del jugador del partido, con barras, y cierre cuando votan todos

**Para qué:** ver cuántos votos lleva cada uno después de votar, no solo al cierre.

**Qué se hizo** (migración `0035_mvp_como_va.sql`, se corre antes del merge):
- `partido_charla` trae el conteo (persona y votos, de más a menos). Lo ve quien ya votó o no puede votar mientras está abierta, y todos al cerrar. Quien puede votar y no ha votado no lo ve, para no votar "por el que va ganando". Nadie ve quién votó por quién.
- En el partido: "Así va la votación" con barras horizontales (el que va primero en dorado y "tu voto" marcado). Al cerrar, debajo del MVP, las barras de todos los votados.
- Si ya votaron todos los que pueden votar (los que jugaron y el cuerpo técnico, con cuenta en la app), la votación cierra sola y se conoce el MVP sin esperar el plazo. Nuevas `mvp_votantes` y `mvp_cerrada`; `mvp_abierta` y `mvp_conteo` las usan.
- Se corrigió el texto de cierre de la votación, que seguía diciendo el día siguiente al partido (debió cambiar con la 0034).
- Modo demostración con la misma regla y votos de ejemplo. 10 pruebas nuevas en `supabase/tests/charla.mjs`.

**Comprobado:** `npm run build` y `npm run test:db` pasan. Pantalla revisada en modo demostración (iPhone 13).

---

## 2026-11-05 · La votación del jugador del partido dura la semana

**Para qué:** dos días era poco para que todos alcancen a votar.

**Qué se hizo** (migración `0034_mvp_semana_completa.sql`, se corre antes del merge):
- La votación cierra a las 23:59 del sexto día después del partido (sábado → viernes; jueves → miércoles), el día antes del partido de la semana siguiente. Solo cambia `mvp_cierre`.
- Los partidos con menos de seis días que ya habían cerrado se vuelven a abrir.
- Modo demostración con la misma regla. Pruebas de `supabase/tests/charla.mjs` ajustadas, más una nueva.

**Comprobado:** `npm run build` y `npm run test:db` pasan. Falta probar con la base real.

---

## 2026-11-05 · El cuerpo técnico vota por el jugador del partido

**Para qué:** el DT y su ayudante no juegan, así que no quedan en "quiénes jugaron" y no podían votar por el MVP.

**Qué se hizo** (migración `0033_cuerpo_tecnico_vota_mvp.sql`, se corre antes del merge):
- Permiso personal nuevo `personas.cuerpo_tecnico`. Lo prende el administrador por SQL, solo a quien corresponda; no hay pantalla para darlo.
- Quien lo tiene vota en los partidos de los planteles en que está, aunque no haya jugado. No pasa a ser candidato ni suma partidos jugados. Las demás reglas del MVP no cambian.
- Cambian `partido_charla` (muestra el botón) y `mvp_votar` (lo acepta). Textos de la votación: "Votan los que jugaron y el cuerpo técnico".
- Pruebas: 7 nuevas en `supabase/tests/charla.mjs`.

**Comprobado:** `npm run build` y `npm run test:db` pasan. Falta probar con la base real.

---

## 2026-11-05 · La tabla de posiciones se actualiza sola desde la liga

**Para qué:** que nadie tenga que copiar la tabla después de cada fecha. Las imágenes de la liga del sábado salen de Deporstar, y Deporstar entrega la tabla como datos en una dirección pública (`api.deporstar.com/api/fixture/match/tabla-positions/<número>/`), sin login.

**Qué se hizo** (migración `0032_tabla_desde_la_liga.sql`, se corre antes del merge):
- Cada plantel guarda el **número de su tabla en Deporstar** (en la app: Tabla de posiciones → "Cambiar a mano o desconectar" → campo "Número de la tabla en Deporstar").
- **Al mirar la tabla**, si la última revisión tiene más de 3 horas, la base la va a buscar a Deporstar con la extensión `http` y la guarda (`tabla_refrescar`). El encargado tiene además **"Actualizar desde la liga"**, que la trae en el acto.
- Solo se arma la dirección de Deporstar con un número entero: no se puede pedir otra página. Si la liga no responde, o responde algo que no es una tabla o una tabla vacía, se avisa y la tabla guardada no se toca.
- El Jara se marca solo (el primer equipo que dice "Jara"). La carga a mano sigue para Senior Jueves (copafacil).
- Pruebas: 17 nuevas en `supabase/tests/tabla.mjs`, con una extensión `http` de mentira (no sale a internet).

**Comprobado:** `npm run build` y `npm run test:db` pasan. Pantalla revisada en modo demostración a 375 px. Falta probar con la base real.

---

## 2026-11-04 · Tabla de posiciones y fechas del campeonato

**Para qué:** que cualquiera vea "cómo vamos" en la liga de cada plantel y las fechas que vienen, sin salir de la app.

**De dónde salen los datos:** se revisaron las páginas de las ligas. La de los planteles del sábado publica la tabla, las fechas y los goleadores como imágenes, y la del jueves arma todo con JavaScript desde su servidor, sin una forma pública de leerla. Por eso no se importa sola: el encargado la copia en la app.

**Qué se hizo** (migración `0026_tabla_posiciones.sql`, se corre antes del merge):
- **Partidos > Tabla de posiciones** (`/tabla`): una tabla por plantel (PJ, G, E, P, GF, GC, DG, Pts; GF y GC se esconden en pantallas angostas), con el Jara destacado, "El Jara va 2º de 8, con 15 puntos", la fecha de actualización y el link a la página de la liga.
- **Actualizar la tabla:** el encargado del plantel (o un administrador) pega la tabla como texto, una línea por equipo ("Equipo 9 6 2 1 20 8 20"), ve cómo queda y la guarda. La base revisa los números y que solo una fila sea el Jara. Las cuentas de prueba solo miran.
- **Próximas fechas** del plantel en la misma pantalla y **Cargar varias fechas de una vez:** se pegan las fechas ("14/11 Rival" o "21/11 09:00 Rival") con campeonato, citación y cancha comunes, y se crean como partidos normales (`partido_guardar`, sin cambios en la base). No repite un día que ya tiene partido. Los cambios por suspensión o de día se corrigen en cada partido, como siempre.
- Archivos nuevos `src/lib/tabla.js`, `src/pages/Tabla.jsx` y `supabase/tests/tabla.mjs` (20 pruebas, entra en `npm run test:db`); ruta en `App.jsx`, botón en `Partidos.jsx` y estilos `posiciones-` al final de `styles.css`.

**Comprobado:** `npm run build` y `npm run test:db` pasan (con la 0025, 0027, 0028, 0029 y 0030 ya en main). Pantallas revisadas en modo demostración a 375 px, sin scroll horizontal ni errores. Falta probar con la base real.

---

## 2026-11-04 · Jugador del partido (MVP), comentarios y reacciones

**Para qué:** que después de cada partido el club vote al mejor, comente y reaccione, como en las redes sociales. Sale de las ideas que llegaron después de la reunión de tesoreros del 3/11.

**Qué se hizo** (migración `0027_mvp_y_comentarios.sql`, se corre antes del merge y **después de la 0025**, que trae `partido_jugadores`):
- **Jugador del partido:** votan solo los que jugaron (la lista "¿Quiénes jugaron?" que marca quien anota el resultado) y no pueden votarse a sí mismos. Abre al anotar el resultado y cierra a las 23:59 del día siguiente (sábado → domingo en la noche, jueves → viernes en la noche). El voto se puede cambiar mientras está abierta; solo se ve cuántos votaron, no por quién. Al cerrar aparece el MVP con sus votos (si empatan, son MVP los empatados), y en Jugadores sale una ★ al lado del nombre (★3 = tres veces MVP), con los mismos filtros de la tabla.
- **Comentarios** en cada partido jugado, con respuestas en cadena (una respuesta a una respuesta queda en el mismo hilo). Máximo 500 letras. Cada uno borra lo suyo; borran cualquiera los administradores, quien edita Comunicaciones y el encargado del plantel del partido (capitán o DT). Un borrado deja "Comentario borrado" para no romper la cadena. Las cuentas de prueba comentan pero no borran lo ajeno.
- **Reacciones** con emoji al partido y a cada comentario, de una lista fija (👏 🔥 ⚽ 💪 😂 😮 😢 ❤️). Tocar el mismo de nuevo lo quita.
- Las tablas no se leen desde el navegador: todo pasa por `partido_charla`, `mvp_votar`, `comentario_agregar`, `comentario_borrar`, `reaccionar_partido`, `reaccionar_comentario` y `mvp_conteo`.
- **App:** en la pantalla de un partido jugado, debajo del resultado: "Jugador del partido", "¿Qué te pareció el partido?" y "Comentarios". Código en `src/lib/charla.js` y `src/components/DespuesDelPartido.jsx`. En modo demostración se ve una votación abierta (partido de ayer) y una cerrada con comentarios.

**Comprobado:** `npm run build`, `npm run test:db` (con 38 pruebas nuevas en `supabase/tests/charla.mjs`) y `npm run test:pedidos` pasan. Pantallas revisadas en modo demostración a 375 px, sin scroll horizontal ni errores.

**Queda para después:** avisar por WhatsApp o notificación cuando abre o cierra la votación; ver el MVP en la lista de partidos jugados.

---

## 2026-11-04 · Partidos jugados por plantel, racha y PJ en las estadísticas

**Para qué:** pedido del administrador después de la reunión de tesoreros. Que "Ya jugados" con **Todos** no sea una lista larga mezclada, que se vea la racha de cada plantel como en las apps de fútbol, y que en Jugadores aparezca todo el que jugó un partido, con filtros para no ver una lista gigante.

**Qué se hizo** (migración `0025_partidos_jugados.sql`, se corre antes del merge):
- **Ya jugados con "Todos":** una sección por plantel (primero los propios) con su racha y sus 3 últimos partidos en filas cortas (fecha, rival, marcador en verde/gris/rojo). "Ver todos los del …" filtra ese plantel. Con un plantel elegido se ve la racha arriba y las tarjetas de siempre.
- **Racha:** los últimos 5 resultados, ✓ ganado, = empatado, ✗ perdido, el más reciente a la derecha. Cada marca lleva al partido. Componente `src/components/Racha.jsx`.
- **Quiénes jugaron:** al anotar el resultado aparece "¿Quiénes jugaron?" con el plantel marcado según los que dijeron "voy"; quien anota corrige si alguien no llegó. Quien tiene goles, asistencias o tarjetas cuenta siempre como que jugó. Tabla nueva `partido_jugadores`; los partidos que ya tenían resultado se rellenan con "voy" + quienes tienen cifras.
- **Jugadores (estadísticas):** columna **PJ**; aparece todo el que jugó al menos un partido con resultado, aunque no tenga goles. Botones "Más: Partidos · Goles · Asistencias · Amarillas · Rojas" para ordenar (además de tocar la columna). Se ven los 10 primeros con "Ver todos"; si tú quedas más abajo, tu fila aparece igual. Filtro por plantel y por categoría ("Senior (todos)" junta los planteles que empiezan igual).
- `partido_resultado` recibe `p_jugaron` (opcional: sin ella toma los "voy", así la app anterior sigue funcionando) y `estadisticas` recibe `p_equipos` (varios planteles) y devuelve `pj`.

**Comprobado:** `npm run build`, `npm run test:db` (7 pruebas nuevas de PJ en `supabase/tests/club.mjs`) y `npm run test:pedidos` pasan. Pantallas revisadas en modo demostración a 375 px, sin scroll horizontal ni errores.

---

## 2026-11-04 · Perfil: botón "Comprobar" en Instagram

En "Editar mi perfil", junto al campo de Instagram, un botón **Comprobar** abre instagram.com/<usuario> para que el jugador confirme que es su cuenta antes de guardar, y se muestra cómo quedará guardado (@usuario). Las sugerencias de Instagram mientras se escribe no son posibles sin una app aprobada por Meta. Solo frontend, sin migración.

---

## 2026-11-04 · Perfil: Instagram, nombres que llevan al perfil y nombres completos

**Qué se hizo** (migración `0030_perfil_instagram.sql`, se corre antes del merge; la 0025, 0026 y 0027 van en otros PR):
- **Instagram:** cada jugador pone su usuario (o pega el link o el @, la base lo limpia) y el club lo ve en su perfil como enlace a su cuenta. Lo cambia solo él. Es un enlace, no una conexión con la cuenta de Instagram.
- **Nombres con enlace:** `NombreConApodo` acepta `enlace`; tocar el nombre abre `/perfil/:id`. Activado en Estadísticas, goleadores y asistencia de cada partido, y listas de entrenamiento (invitados sin cuenta no llevan enlace). No se usa dentro de botones (por ejemplo, al votar el MVP). En el perfil ajeno, "‹ Volver" regresa a la pantalla de donde se vino.
- **Nombres completos en Estadísticas:** el nombre ya no se corta con "…": baja a una segunda línea, y las columnas de números son más angostas (probado en iPhone SE y 13).
- **Mis fotos:** queda el espacio en el perfil con un "Pronto". La galería es de la Fase F (carril de Comunicaciones); se coordina con ese carril.

**Comprobado:** `npm run build`, `npm run test:db` (8 pruebas nuevas de Instagram en `perfil.mjs`).

---

## 2026-11-04 · RUT y fecha de nacimiento en Tesorería

**Para qué:** la liga pide seguido el RUT y la fecha de nacimiento de cada jugador, y las fechas alimentan los cumpleaños. Los tesoreros los tienen en una planilla común (fuera del repo); con esto quedan en la app y se puede importar esa planilla.

**Qué se hizo** (migración `0029_rut_y_nacimiento_en_tesoreria.sql`, se corre después de la 0028 y antes del merge):
- **RUT** en `persona_contactos.rut`, guardado como `12345678-K`. `rut_normalizar()` acepta puntos, guion y k minúscula, revisa el dígito verificador y rechaza lo que no sea un RUT. No se repite entre dos personas.
- **Fecha de nacimiento:** la misma del perfil (`perfiles.nacimiento`, 0028).
- **Ficha del jugador en Tesorería:** campos RUT y fecha de nacimiento. Se guardan con `tes_guardar_identidad()`, solo para jugadores de ese plantel, y solo si cambiaron.
- **Quién ve:** el tesorero del plantel, Hacienda y administradores ven RUT y fecha completa de su plantel (`tes_ver`). Las cuentas de prueba no. El resto del club sigue viendo solo día y mes del cumpleaños.
- **Quién cambia:** los mismos (tesorero del plantel, Hacienda, administradores). El jugador puede corregir su fecha desde Mi perfil, pero no su RUT.
- **Lista para la liga** (Tesorería > Jugadores > Bajar lista): un CSV que abre Excel, con nombre, RUT con puntos, fecha de nacimiento, edad, celular y correo de quienes juegan la temporada. Avisa a cuántos les falta RUT o fecha.

**Comprobado:** `npm run build` y `npm run test:db` pasan (18 pruebas nuevas en `supabase/tests/tesoreria.mjs`). Ficha revisada en modo demostración a 400 px.

**Siguiente:** importar la planilla común cuando los tesoreros la revisen. El SQL de importación se arma fuera del repo, porque lleva datos personales.

---

## 2026-11-04 · Perfil del jugador (Fase 7, parte 2)

**Para qué:** que cada jugador tenga su ficha con foto, apodo, dorsal, posición y pie hábil, y que el club pueda ver quién es quién en cada plantel.

**Qué se hizo** (migración `0028_perfil_jugador.sql`, se corre antes del merge; la 0025, 0026 y 0027 van en otros PR):
- **Mi perfil** (`/perfil`, desde Más): foto, apodo, dorsal en cada plantel donde juega, posición (arquero, defensa, lateral, volante, delantero), pie hábil, fecha de nacimiento, estatura y peso. La foto se achica en el teléfono a 600 px y va a un bucket privado que solo ven los socios del club.
- **Lo que no edita el jugador:** nombre, celular y correo. Se muestran en "Tus datos del club" y los cambia el tesorero o Hacienda desde Tesorería (0024).
- **Qué ve el resto:** foto, apodo, dorsal, posición, pie y el día del cumpleaños (sin el año). Estatura y peso solo si el jugador lo elige. Celular, correo y fecha completa, solo él.
- **Carga por otros:** el tesorero y el encargado del plantel, Hacienda y administradores pueden poner dorsal, posición y pie (para quienes aún no entran a la app). El dorsal, solo en su plantel. Las cuentas de prueba no cargan perfiles ajenos.
- **Planteles** (`/planteles`, desde Más): jugadores de cada plantel ordenados por dorsal, con foto y posición; tocando uno se abre su perfil.
- El apodo se movió de Más a Mi perfil (se borró `MiApodo.jsx`).

**Comprobado:** `npm run build`, `npm run test:db` (incluye `supabase/tests/perfil.mjs`, 44 pruebas nuevas) y `npm run test:pedidos` pasan. Recorrido en modo demostración en tamaño iPhone 13 sin errores.

**Pendiente:** enlazar el perfil desde Estadísticas y la asistencia de los partidos (se deja para no chocar con los PR de esas pantallas). La fecha de nacimiento queda lista para el módulo Cumpleaños.
---

## 2026-11-04 · Partidos jugados por plantel, racha y PJ en las estadísticas

**Para qué:** pedido del administrador después de la reunión de tesoreros. Que "Ya jugados" con **Todos** no sea una lista larga mezclada, que se vea la racha de cada plantel como en las apps de fútbol, y que en Jugadores aparezca todo el que jugó un partido, con filtros para no ver una lista gigante.

**Qué se hizo** (migración `0025_partidos_jugados.sql`, se corre antes del merge):
- **Ya jugados con "Todos":** una sección por plantel (primero los propios) con su racha y sus 3 últimos partidos en filas cortas (fecha, rival, marcador en verde/gris/rojo). "Ver todos los del …" filtra ese plantel. Con un plantel elegido se ve la racha arriba y las tarjetas de siempre.
- **Racha:** los últimos 5 resultados, ✓ ganado, = empatado, ✗ perdido, el más reciente a la derecha. Cada marca lleva al partido. Componente `src/components/Racha.jsx`.
- **Quiénes jugaron:** al anotar el resultado aparece "¿Quiénes jugaron?" con el plantel marcado según los que dijeron "voy"; quien anota corrige si alguien no llegó. Quien tiene goles, asistencias o tarjetas cuenta siempre como que jugó. Tabla nueva `partido_jugadores`; los partidos que ya tenían resultado se rellenan con "voy" + quienes tienen cifras.
- **Jugadores (estadísticas):** columna **PJ**; aparece todo el que jugó al menos un partido con resultado, aunque no tenga goles. Botones "Más: Partidos · Goles · Asistencias · Amarillas · Rojas" para ordenar (además de tocar la columna). Se ven los 10 primeros con "Ver todos"; si tú quedas más abajo, tu fila aparece igual. Filtro por plantel y por categoría ("Senior (todos)" junta los planteles que empiezan igual).
- `partido_resultado` recibe `p_jugaron` (opcional: sin ella toma los "voy", así la app anterior sigue funcionando) y `estadisticas` recibe `p_equipos` (varios planteles) y devuelve `pj`.

**Comprobado:** `npm run build`, `npm run test:db` (7 pruebas nuevas de PJ en `supabase/tests/club.mjs`) y `npm run test:pedidos` pasan. Pantallas revisadas en modo demostración a 375 px, sin scroll horizontal ni errores.

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
