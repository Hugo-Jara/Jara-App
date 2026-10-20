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
1. Trabaja en la rama que te asignen y abre un PR.
2. La cuenta del club aprueba el PR y se hace Squash and merge.
3. Las migraciones (`supabase/migrations/`) las corre Seba en Supabase **antes** del merge. Una migración nueva nunca edita una vieja.
4. No toques migraciones, permisos, `src/lib/sesion.jsx` ni nada que mueva plata sin que la fase lo pida.

## Reglas duras
- Escribe en español de Chile y tutea ("tienes", no "tenés"). Tono cercano y simple.
- Nada de datos personales en el repo, que es público: ni nombres de socios, ni RUT, cuentas, teléfonos, correos o claves. Se habla de roles. Los datos de prueba se inventan.
- Nunca subas `.env.local` ni claves.
- Una fase por sesión.
- Al cerrar cada fase: commit, entrada nueva en `BITACORA.md` y reporte corto.
- Lo histórico va a `BITACORA.md`, no a este archivo.
