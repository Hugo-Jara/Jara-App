import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

// Sin datos de conexión la app corre en modo demostración: se puede recorrer,
// pero no guarda ni lee nada.
export const esDemo = !url || !key;
export const supabase = esDemo ? null : createClient(url, key);
