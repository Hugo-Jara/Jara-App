import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

// Sin datos de conexión la app corre en modo demostración: se puede recorrer,
// pero no guarda ni lee nada.
export const esDemo = !url || !key;
export const supabase = esDemo ? null : createClient(url, key);

// Sin señal, el navegador da un error en inglés que cambia según el teléfono
// ("Failed to fetch" en Android, "Load failed" en iPhone…).
const ERROR_DE_RED = /failed to fetch|load failed|networkerror|network request failed|fetch failed/i;
export const SIN_CONEXION = 'No pudimos conectar con el club. Revisa tu señal e intenta de nuevo.';

// Llama a una función de la base. Los mensajes de error vienen escritos para
// mostrárselos tal cual a la persona; los de red se traducen.
export async function llamar(funcion, parametros) {
  const { data, error } = await supabase.rpc(funcion, parametros);
  if (error) throw new Error(ERROR_DE_RED.test(error.message) ? SIN_CONEXION : error.message);
  return data;
}
