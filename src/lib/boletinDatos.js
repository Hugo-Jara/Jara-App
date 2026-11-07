// Modelo exclusivo del boletín: nunca consulta Supabase ni publica borradores.
export const TIPOS_BLOQUE = { principal: 'Noticia principal', columnas: 'Noticias en dos columnas', breve: 'Noticia breve', destacada: 'Noticia destacada', agenda: 'Lo que viene' };
export const DISPOSICIONES_FOTO = {
  abajo: 'Foto después del texto', arriba: 'Foto antes del texto',
  lado_izquierda: 'Foto a la izquierda', lado_derecha: 'Foto a la derecha',
  rodear_izquierda: 'Rodear foto a la izquierda', rodear_derecha: 'Rodear foto a la derecha',
};
export const idNuevo = () => crypto.randomUUID();
export const notaNueva = () => ({ id: idNuevo(), titulo: '', texto: '', fotos: [] });
export const bloqueNuevo = (tipo) => ({ id: idNuevo(), tipo, notas: Array.from({ length: tipo === 'columnas' ? 2 : 1 }, notaNueva), eventos: tipo === 'agenda' ? [{ id: idNuevo(), fecha: '', descripcion: '' }] : [] });
export const edicionNueva = (numero = 1) => ({ version: 1, id: idNuevo(), numero, nombre: '', periodo: '', resumen: '', bloques: [], modificada: new Date().toISOString() });
export const nombreEdicion = (e) => e.nombre || `El Jara Informa N°${e.numero}`;
const texto = 'Esta es una noticia inventada para probar el boletín. El equipo de ejemplo comparte una jornada de encuentro y prepara nuevas actividades.\n\nTodos pueden participar y aportar ideas. Las fechas, los resultados y las actividades de esta edición son ficticios; no corresponden a anuncios oficiales del club.';
const demo = (numero, periodo) => {
  const e = { ...edicionNueva(numero), id: `demo-${numero}`, periodo, nombre: '', resumen: 'Una edición ficticia para conocer el nuevo periódico del club.' };
  e.bloques = ['principal', 'columnas', 'destacada', 'breve', 'agenda'].map(bloqueNuevo);
  const titulos = ['Un club que construimos entre todos', 'Volvemos a la cancha', 'También nos encontramos fuera del fútbol', 'Un esfuerzo compartido', 'La voz de la comunidad'];
  let i = 0;
  e.bloques.forEach(b => b.notas.forEach(n => { n.titulo = titulos[i++ % titulos.length]; n.texto = texto; }));
  e.bloques[0].notas[0].fotos = [{ id: idNuevo(), demo: true, x: 50, y: 50, zoom: 1, pie: 'Ilustración demostrativa · sin fotografías del club' }];
  e.bloques[4].eventos = [{ id: idNuevo(), fecha: 'Fecha de ejemplo', descripcion: 'Encuentro recreativo ficticio. Horario por confirmar.' }];
  return e;
};
// Catálogo ordenado por número, del más nuevo al más antiguo: la edición de
// número mayor es siempre la «última» y reemplaza a la anterior en portada.
export const ordenarCatalogo = lista => [...lista].sort((a, b) => b.numero - a.numero);
export const CATALOGO = ordenarCatalogo([demo(2, 'Octubre 2026 · DEMO'), demo(3, 'Noviembre 2026 · DEMO')]);

// Operaciones sobre las fotos de una noticia. Siempre reciben la lista vigente
// (no una copia vieja) y ubican cada foto por su id, no por su posición, para
// que una carga lenta no pise ajustes hechos mientras tanto.
export const agregarFotos = (fotos, nuevas) => [...fotos, ...nuevas.filter(n => !fotos.some(f => f.id === n.id))];
export const actualizarFoto = (fotos, id, cambios) => fotos.map(f => f.id === id ? { ...f, ...cambios } : f);
export const quitarFoto = (fotos, id) => fotos.filter(f => f.id !== id);
export function moverFoto(fotos, id, delta) {
  const i = fotos.findIndex(f => f.id === id), j = i + delta;
  if (i < 0 || j < 0 || j >= fotos.length) return fotos;
  const nueva = [...fotos]; [nueva[i], nueva[j]] = [nueva[j], nueva[i]]; return nueva;
}
export function validarEdicion(e) {
  if (!e || e.version !== 1 || typeof e.id !== 'string' || !Number.isInteger(e.numero) || e.numero < 1 || typeof e.nombre !== 'string' || typeof e.periodo !== 'string' || typeof e.resumen !== 'string' || !Array.isArray(e.bloques) || e.bloques.length > 200) throw new Error('El respaldo no contiene una edición compatible.');
  const cadena = v => typeof v === 'string' && v.length <= 200000;
  for (const b of e.bloques) {
    if (!TIPOS_BLOQUE[b.tipo] || typeof b.id !== 'string' || !Array.isArray(b.notas) || b.notas.length !== (b.tipo === 'columnas' ? 2 : 1) || !Array.isArray(b.eventos)) throw new Error('Bloques del respaldo inválidos.');
    for (const n of b.notas) {
      if (typeof n.id !== 'string' || !cadena(n.titulo) || !cadena(n.texto) || !Array.isArray(n.fotos)) throw new Error('Noticias del respaldo inválidas.');
      if ((n.disposicion != null && !Object.hasOwn(DISPOSICIONES_FOTO, n.disposicion)) || (n.mantenerJunta != null && typeof n.mantenerJunta !== 'boolean')) throw new Error('Distribución de noticia inválida.');
      for (const f of n.fotos) if (typeof f.id !== 'string' || (!f.demo && (typeof f.src !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(f.src))) || ![f.x, f.y, f.zoom].every(Number.isFinite) || f.x < 0 || f.x > 100 || f.y < 0 || f.y > 100 || f.zoom < 1 || f.zoom > 3 || !cadena(f.pie || '')) throw new Error('Fotografía o encuadre del respaldo inválido.');
    }
    if (!b.eventos.every(v => typeof v.id === 'string' && cadena(v.fecha) && cadena(v.descripcion))) throw new Error('Agenda del respaldo inválida.');
  }
  return e;
}
