// El documental de los 20 años: un video de YouTube "no listado" (no ocupa
// espacio del club ni de Supabase). Para ponerlo o cambiarlo, pega aquí el
// enlace tal como lo copia YouTube (sirven youtu.be/..., youtube.com/watch?v=...
// y youtube.com/shorts/...). Vacío = el botón dice "Muy pronto".
export const DOCUMENTAL_ENLACE = '';

// Saca el código del video del enlace. null si no se entiende.
export function codigoYoutube(enlace) {
  const texto = (enlace ?? '').trim();
  if (!texto) return null;
  if (/^[\w-]{11}$/.test(texto)) return texto;
  try {
    const u = new URL(texto);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let codigo = null;
    if (host === 'youtu.be') codigo = u.pathname.slice(1).split('/')[0];
    else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      codigo = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1] ?? null;
    }
    return codigo && /^[\w-]{11}$/.test(codigo) ? codigo : null;
  } catch { return null; }
}

export const documentalListo = () => !!codigoYoutube(DOCUMENTAL_ENLACE);
export const urlYoutube = () => `https://www.youtube.com/watch?v=${codigoYoutube(DOCUMENTAL_ENLACE)}`;
// youtube-nocookie: YouTube no guarda cookies hasta que la persona le da play.
export const urlIncrustada = () => `https://www.youtube-nocookie.com/embed/${codigoYoutube(DOCUMENTAL_ENLACE)}?rel=0&playsinline=1`;
