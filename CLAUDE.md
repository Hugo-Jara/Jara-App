# Jara App · contexto para quien trabaje en este proyecto (personas e IA)

Lee esto completo antes de tocar nada.

## Qué es
Jara App es la app del Club Deportivo Hugo Jara (Santiago, Chile), un club de fútbol amateur con ~80 socios en tres planteles: Senior Jueves, Senior Sábado y Junior Sábado. Está organizado "como un Estado", con ministerios (Hacienda, Deportes, Comunicaciones, etc.). La estrenamos en la fiesta de los 20 años, el **21 de noviembre de 2026**. Por ahora es solo para el Hugo Jara; la idea es poder replicarla en otros clubes más adelante.

Principio de producto: **primero el jugador**. La portada responde tres cosas: confirmar asistencia al próximo partido, anotarse al entrenamiento, ver fotos y último partido. Lo burocrático (cuota, compras, asambleas, ministerios) va en el menú "Más". Todo se dice en español de Chile, tuteando y sin voseo ("tienes", no "tenés"). Tono cercano y simple, nada corporativo.

## Cómo está hecho
- React 18 + Vite, JavaScript con JSX (sin TypeScript), react-router-dom v6. Es una PWA instalable.
- Un solo archivo de estilos: `src/styles.css`. Colores: fondo oscuro `#120E0D`, rojo `#C6362B`, dorado `#C6A15B`. Tipografías: Archivo Black (títulos) e Inter (texto). Mantén ese estilo.
- Base de datos: Supabase (Postgres). Toda lectura y escritura pasa por **funciones SQL** (RPC) que validan permisos. Desde el navegador nunca se consultan tablas directamente. Se llaman con `llamar('nombre_funcion', params)` de `src/lib/supabase.js`.
- Sin credenciales, la app abre en **modo demostración** con datos inventados en memoria (`esDemo`). Así se puede trabajar sin tocar datos reales.
- Se publica sola en GitHub Pages al subir cambios a la rama `main`: https://hugo-jara.github.io/Jara-App/ . Antes de publicar corre las pruebas y el build; si algo falla, no se publica.

## Dónde está cada cosa
- `src/pages/`: una pantalla por módulo. `src/lib/`: la lógica de cada módulo (`partidos.js`, `entrenamiento.js`, `noticias.js`, `pedido.js`, `ingreso.js`…). `src/components/`: piezas compartidas.
- `src/lib/sesion.jsx`: sesión, quién es la persona, sus planteles y sus permisos (admin, encargado, tesorero).
- `supabase/migrations/`: la base de datos, en orden (0001, 0002…). `supabase/tests/`: pruebas de permisos y flujos.
- `README.md`: tabla de migraciones y cómo correr todo.

## Estado actual
Funciona con datos reales: ingreso por nombre con aprobación del encargado, partidos y asistencia, entrenamientos con cupos y pagos, pedidos de compra por link (con cotización, comprobante, boleta, edición y eliminación por Hacienda).
Hoy **solo en modo demostración** (sin guardar): Noticias y boletín (`src/lib/noticias.js`), Cuota, Asambleas y páginas de ministerios.

## Reglas que no se negocian
1. **Cero datos reales en este repositorio.** El repo es público. Nada de nombres de socios, RUT, cuentas bancarias, teléfonos, correos ni claves. Los datos de demostración se inventan.
2. **Nunca subir `.env.local` ni claves.** La llave pública de Supabase ya está en el despliegue; ninguna otra clave debe aparecer en el código ni en el chat.
3. **No tocar sin revisión de Seba:** `supabase/migrations/`, `src/lib/sesion.jsx`, permisos y roles, y todo lo que mueva plata (cuotas, compras, pagos). Un error ahí afecta datos de 80 personas. Si un cambio necesita base de datos, se escribe como migración nueva (nunca se edita una vieja) y la revisa Seba antes de aplicarla.
4. Los cambios de quien no es Seba se proponen en **una rama aparte** (nombre tipo `comunicaciones/boletin`), nunca directo a `main`.
5. Todo cambio con pantalla se prueba en celular (ancho 390 px) y en modo demostración.
6. Antes de dar algo por listo: `npm run build` sin errores. Si se tocó la base de datos: `npm run test:db`.
7. Cambios chicos y de a uno. Una idea por cambio, con un mensaje claro de qué hizo.

## Si eres una IA (Claude, ChatGPT u otra) y alguien te pasa este archivo
Pregunta primero qué módulo quiere trabajar y qué quiere que cambie. Explica en simple qué vas a modificar y por qué, antes de hacerlo: la persona está aprendiendo y quiere entender. Si lo que te piden toca la regla 3, detente y dilo. Entrega los archivos completos que cambiaron, indicando la ruta de cada uno.
