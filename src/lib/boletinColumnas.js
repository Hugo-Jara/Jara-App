import { idNuevo, notaNueva } from './boletinDatos.js';

// El respaldo original guardaba exactamente dos noticias sin columna explícita.
export function columnaDe(nota, indice) { return nota.columna || (indice === 0 ? 'izquierda' : 'derecha'); }
export function normalizarColumnas(bloque) {
  return bloque.notas.map((n, i) => ({ ...n, columna: columnaDe(n, i) }));
}
export function agregarEnColumna(bloque, columna) {
  return { ...bloque, notas: [...normalizarColumnas(bloque), { ...notaNueva(), columna }] };
}
export function moverAColumna(bloque, id, columna) {
  return { ...bloque, notas: normalizarColumnas(bloque).map(n => n.id === id ? { ...n, columna } : n) };
}
export function moverEnColumna(bloque, id, direccion) {
  const notas = normalizarColumnas(bloque), i = notas.findIndex(n => n.id === id);
  if (i < 0) return bloque;
  const misma = notas.filter(n => n.columna === notas[i].columna), j = misma.findIndex(n => n.id === id), otra = misma[j + direccion];
  if (!otra) return bloque;
  const k = notas.findIndex(n => n.id === otra.id); [notas[i], notas[k]] = [notas[k], notas[i]];
  return { ...bloque, notas };
}
export function cambiarFormato(edicion, bloqueId, notaId, tipo) {
  const indice = edicion.bloques.findIndex(b => b.id === bloqueId), b = edicion.bloques[indice];
  if (!b || !['principal', 'breve', 'destacada', 'columnas'].includes(tipo)) return edicion;
  if (b.tipo === 'columnas' && b.notas.length === 1 && (b.tituloSeccion?.trim() || b.introduccion?.trim())) return edicion;
  const notas = b.tipo === 'columnas' ? normalizarColumnas(b) : b.notas;
  const n = notas.find(v => v.id === notaId); if (!n || b.tipo === tipo) return edicion;
  const limpio = { ...n }; delete limpio.columna;
  const nuevo = { ...b, tipo, notas: [tipo === 'columnas' ? { ...limpio, columna: 'izquierda' } : limpio] };
  const bloques = [...edicion.bloques];
  if (b.tipo !== 'columnas' || notas.length === 1) bloques[indice] = nuevo;
  else { bloques[indice] = { ...b, notas: notas.filter(v => v.id !== notaId) }; bloques.splice(indice + 1, 0, { ...nuevo, id: idNuevo() }); }
  return { ...edicion, bloques };
}
export function trasladarNoticia(edicion, origenId, notaId, destinoId, columna) {
  if (origenId === destinoId || !['izquierda', 'derecha'].includes(columna)) return edicion;
  const origen = edicion.bloques.find(b => b.id === origenId), destino = edicion.bloques.find(b => b.id === destinoId);
  if (origen?.tipo === 'columnas' && origen.notas.length === 1 && (origen.tituloSeccion?.trim() || origen.introduccion?.trim())) return edicion;
  if (!origen || !destino || destino.tipo !== 'columnas' || destino.notas.length >= 200 || !['columnas','principal','breve','destacada'].includes(origen.tipo)) return edicion;
  const notasOrigen = origen.tipo === 'columnas' ? normalizarColumnas(origen) : origen.notas;
  const nota = notasOrigen.find(n => n.id === notaId); if (!nota) return edicion;
  const bloques = edicion.bloques.flatMap(b => {
    if (b.id === destinoId) return [{ ...b, notas: [...normalizarColumnas(b), { ...nota, columna }] }];
    if (b.id === origenId) { const restantes = notasOrigen.filter(n => n.id !== notaId); return restantes.length ? [{ ...b, notas: restantes }] : []; }
    return [b];
  });
  return { ...edicion, bloques };
}
