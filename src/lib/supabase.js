import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

// Sin datos de conexión la app corre en modo demostración: se puede recorrer,
// pero no guarda ni lee nada.
export const esDemo = !url || !key;
export const supabase = esDemo ? null : createClient(url, key);

// Llama a una función de la base. Los mensajes de error vienen escritos para
// mostrárselos tal cual a la persona.
export async function llamar(funcion, parametros) {
  const { data, error } = await supabase.rpc(funcion, parametros);
  if (error) throw new Error(error.message);
  return data;
}
