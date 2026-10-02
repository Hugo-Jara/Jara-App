// Comprueba contra el proyecto real que sin sesión no se puede leer nada.
//   node --env-file=.env.local supabase/tests/api-anonima.mjs
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);
let mal = 0;
for (const t of ['clubes', 'personas', 'persona_contactos', 'solicitudes_compra', 'solicitud_adjuntos']) {
  const { data, error } = await sb.from(t).select('*').limit(5);
  const filas = data?.length ?? 0;
  if (error && !error.code) {
    console.log('No se pudo conectar con Supabase:', error.message);
    process.exit(2);
  }
  if (!error && filas > 0) mal++;
  console.log(t.padEnd(20), error ? `rechazado (${error.code})` : `${filas} filas`);
}
const r = await sb.rpc('vincular_persona');
console.log('rpc vincular_persona'.padEnd(20), r.error ? `rechazado (${r.error.code})` : JSON.stringify(r.data));
if (!r.error && r.data) mal++;
process.exit(mal ? 1 : 0);
