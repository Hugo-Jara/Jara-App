// Cambio de casa: la app pasó de hugo-jara.github.io/Jara-App a hugojara.cl.
// La dirección vieja quedó como un "puente" (carpeta puente/) que manda a la
// persona a la misma pantalla en la dirección nueva y le pasa, en la parte
// del link que nunca llega a ningún servidor (#), su sesión y sus ajustes.
// Así nadie tiene que volver a entrar.

const MARCA = '#jara-traspaso=';
const ORIGEN_VIEJO = 'https://hugo-jara.github.io';
// Solo estas llaves se copian; cualquier otra cosa que venga se ignora.
const LLAVES = ['jara-ajustes', 'jara-entra-con-clave', 'jara-bienvenida-vista', 'pedido-nombre'];

let pendiente = null;

// Corre antes de dibujar la app: guarda los ajustes (tema, letra) para que se
// apliquen desde el primer momento y deja la sesión lista para recibirTraspaso.
export function leerTraspaso() {
  try {
    const h = window.location.hash;
    if (!h.startsWith(MARCA)) return;
    // El link se limpia altiro para que la sesión no quede en el historial.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    // Solo se acepta si la persona viene de la dirección vieja.
    if (!document.referrer.startsWith(ORIGEN_VIEJO)) return;
    const p = JSON.parse(decodeURIComponent(h.slice(MARCA.length)));
    for (const k of LLAVES) {
      if (typeof p?.extras?.[k] === 'string') localStorage.setItem(k, p.extras[k]);
    }
    if (typeof p?.at === 'string' && typeof p?.rt === 'string') pendiente = { access_token: p.at, refresh_token: p.rt };
  } catch { /* link raro o sin almacenamiento: se entra como siempre */ }
}

// Si traía sesión y aquí no hay ninguna, la deja abierta. Si falla (por
// ejemplo, la sesión ya había vencido), la persona simplemente entra de nuevo.
export async function recibirTraspaso(supabase) {
  const s = pendiente;
  pendiente = null;
  if (!s || !supabase) return;
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) return;
    await supabase.auth.setSession(s);
  } catch { /* se entra como siempre */ }
}
