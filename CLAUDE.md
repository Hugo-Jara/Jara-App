# Jara App · guía para sesiones de Claude Code

App del Club Deportivo Hugo Jara. El plan vigente está en `PLAN-JARA-APP.md` y lo hecho en `BITACORA.md`. Lee ambos al partir.

## Stack
- React 18 + Vite, JavaScript con JSX (sin TypeScript), react-router-dom v6, PWA instalable.
- Supabase (Postgres): toda lectura y escritura pasa por funciones SQL (RPC) con `llamar()` de `src/lib/supabase.js`; nunca se consultan tablas desde el navegador.
- Sin credenciales corre en modo demostración (`esDemo`), con datos inventados en memoria.
- Un solo archivo de estilos: `src/styles.css`.
- Se publica sola en GitHub Pages al llegar a `main`, tras pasar las pruebas y el build.

## Comandos
- `npm run dev`: servidor de desarrollo.
- `npm run build`: compila.
- `npm run test:db`: permisos y flujos de la base (Postgres en memoria).
- `npm run test:pedidos`: pedidos de compra por link.

## Flujo de trabajo
0. Antes de empezar una fase, el PR de la fase anterior tiene que estar mergeado; parte siempre desde main actualizado.
1. Trabaja en la rama que te asignen y abre un PR.
2. La cuenta del club aprueba el PR y se hace Squash and merge.
3. Las migraciones (`supabase/migrations/`) las corre el administrador de la app en Supabase **antes** del merge. Una migración nueva nunca edita una vieja.
4. **No se toca sin revisión del administrador de la app (y de Hacienda, si mueve plata):** `supabase/migrations/`, `src/lib/sesion.jsx`, permisos y roles, y todo lo que mueva plata (cuotas, compras, pagos). Un error ahí afecta datos de ~80 personas. Si un cambio necesita base de datos, se escribe como migración nueva (nunca se edita una vieja) y la revisa antes de aplicarse. Si te piden algo que cae aquí, detente y dilo.

## Cómo se organiza la plata del club
- El ministro de Hacienda es el tesorero formal del club y consolida todo.
- Cada plantel (Senior Sábado, Senior Jueves, Junior Sábado) tiene un tesorero que depende de Hacienda. El plantel cobra a sus jugadores y le entrega al club un aporte según sus jugadores.
- Entrenamiento funciona aparte: su encargado administra sus propios ingresos y egresos (cupos, pagos, multas) y no entrega aporte por jugador. Hacienda solo lo ve. Ese mismo encargado administra el Fondo de Las Condes.

## Reglas duras
- Escribe en español de Chile y tutea ("tienes", no "tenés"). Tono cercano y simple.
- Nada de datos personales en el repo, que es público: ni nombres de socios, ni RUT, cuentas, teléfonos, correos o claves. Se habla de roles. Los datos de prueba se inventan.
- Nunca subas `.env.local` ni claves.
- Una fase por sesión.
- Al cerrar cada fase: commit, entrada nueva en `BITACORA.md` y reporte corto.
- Lo histórico va a `BITACORA.md`, no a este archivo.
