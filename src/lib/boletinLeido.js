// El Jara Informa en Inicio: la edición nueva va arriba hasta que la persona
// la lee; después baja, bajo sus partidos y su entrenamiento.
//
// "Leída" se guarda en la base (0056) para que valga en todos los
// dispositivos, y además en este navegador para que el cambio sea inmediato y
// siga funcionando aunque la base no responda.
import { llamar } from './supabase.js';

const CLAVE = 'jara.boletin.leidas';

function locales() {
  try { return new Set(JSON.parse(localStorage.getItem(CLAVE) || '[]')); } catch { return new Set(); }
}
function guardarLocal(id) {
  try {
    const ids = [...locales(), id].slice(-30);
    localStorage.setItem(CLAVE, JSON.stringify([...new Set(ids)]));
  } catch { /* sin almacenamiento local: queda solo en la base */ }
}

// Marca la edición como leída. Nunca lanza error: si la base falla, queda al
// menos en este dispositivo.
export async function marcarLeida(id) {
  if (!id) return;
  guardarLocal(id);
  try { await llamar('boletin_marcar_leida', { p_id: id }); } catch { /* reintenta la próxima vez */ }
}

// ¿La persona ya la leyó? Primero mira este dispositivo; si no, pregunta a la
// base (por si la leyó en otro). Ante cualquier error, "no leída": así lo nuevo
// nunca se esconde.
export async function yaLeida(id) {
  if (!id) return false;
  if (locales().has(id)) return true;
  try {
    const leida = await llamar('boletin_leida', { p_id: id });
    if (leida) guardarLocal(id);
    return !!leida;
  } catch { return false; }
}
