// Comparación de contenido para detectar cambios sin duplicar imágenes en el borrador.
function resumenOp(op) {
  if (!op.foto) return op;
  const { src, ...foto } = op.foto;
  return { ...op, foto: { ...foto, tamanoOriginal: src?.length || 0 } };
}
export function firmaPagina(edicion, operaciones) {
  const texto = JSON.stringify({ numero: edicion.numero, nombre: edicion.nombre, periodo: edicion.periodo, operaciones: operaciones.map(resumenOp) });
  let hash = 2166136261;
  for (let i = 0; i < texto.length; i++) { hash ^= texto.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}
const contenido = ops => ops.reduce((n, op) => n + (op.tipo === 'texto' ? (op.texto?.length || 0) : op.tipo === 'foto' ? 500 : 0), 0);
export async function proponerAjuste(edicion, paginas, indice, componer) {
  const ops = paginas.operaciones;
  if (!ops || !ops[indice] || !ops[indice + 1]) return { error: 'No hay una página siguiente para intentar compactar.' };
  const anteriores = new Set(ops.slice(0, indice).flatMap(p => p.map(op => op.bloqueId)).filter(Boolean));
  const candidatos = new Set([...(ops[indice] || []), ...(ops[indice + 1] || [])].map(op => op.bloqueId).filter(id => id && !anteriores.has(id)));
  const modificables = edicion.bloques.filter(b => candidatos.has(b.id) && !b.compacto && ['principal','breve','destacada','columnas'].includes(b.tipo));
  if (!modificables.length) return { error: 'No hay noticias que se puedan compactar en esta página sin cambiar las anteriores.' };
  const ids = new Set(modificables.map(b => b.id));
  const propuesta = { ...edicion, bloques: edicion.bloques.map(b => ids.has(b.id) ? { ...b, compacto: true } : b) };
  let resultado;
  try { resultado = await componer(propuesta); } catch { return { error: 'No fue posible ajustar esta página sin afectar el contenido. Prueba reorganizando las noticias.' }; }
  for (let i = 0; i < indice; i++) {
    if (!resultado.operaciones[i] || firmaPagina(edicion, ops[i]) !== firmaPagina(propuesta, resultado.operaciones[i])) return { error: 'Este ajuste cambiaría una página anterior. Prueba reorganizando las noticias.' };
  }
  if (resultado.length >= paginas.length && contenido(resultado.operaciones[indice] || []) <= contenido(ops[indice])) return { error: 'No se logró incorporar más contenido sin reducir más los tamaños. Prueba reorganizando las noticias.' };
  return { edicion: propuesta, paginas: resultado, ids: [...ids] };
}
