// Buscador de jugadores: compara sin tildes ni mayúsculas ("nunez" encuentra
// "Núñez") contra el nombre (Nombre + Apellido paterno) y el apodo.

export const normal = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Qué tan bien calza una persona con lo escrito (menor es mejor; null si no calza):
// 0 el nombre empieza con lo escrito, 1 el apodo empieza con lo escrito,
// 2 cada palabra escrita es el comienzo de una palabra del nombre o del apodo
// ("pab mor" encuentra "Pablo Moreno"), 3 lo escrito aparece en medio de una
// palabra (desde tres letras: "driguez" encuentra "Rodríguez").
export function calce(persona, escrito) {
  const q = normal(escrito);
  if (!q) return null;
  const nombre = normal(persona.nombre);
  const apodo = normal(persona.apodo);
  if (nombre.startsWith(q)) return 0;
  if (apodo && apodo.startsWith(q)) return 1;
  const palabras = `${nombre} ${apodo}`.split(' ').filter(Boolean);
  const libres = [...palabras];
  const todas = q.split(' ').every((w) => {
    const i = libres.findIndex((p) => p.startsWith(w));
    if (i < 0) return false;
    libres.splice(i, 1); // "juan juan" no calza dos veces con el mismo "Juan"
    return true;
  });
  if (todas) return 2;
  if (q.length >= 3 && `${nombre} ${apodo}`.includes(q)) return 3;
  return null;
}

// Las personas que calzan, de la que mejor calza a la que menos, y por nombre.
export function buscarPersonas(personas, escrito, max = 6) {
  return personas
    .map((p) => ({ p, c: calce(p, escrito) }))
    .filter((x) => x.c !== null)
    .sort((a, b) => a.c - b.c || a.p.nombre.localeCompare(b.p.nombre, 'es'))
    .slice(0, max)
    .map((x) => x.p);
}

// Junta a los jugadores de todos los planteles en una sola lista, sin repetir a
// quien está en dos, con los nombres de sus planteles.
export function personasDePlanteles(planteles = []) {
  const porId = new Map();
  planteles.forEach((e) => (e.jugadores ?? []).forEach((j) => {
    const ya = porId.get(j.id);
    if (ya) { if (!ya.planteles.includes(e.nombre)) ya.planteles.push(e.nombre); return; }
    porId.set(j.id, { id: j.id, nombre: j.nombre ?? '', apodo: j.apodo ?? '', foto_ruta: j.foto_ruta, planteles: [e.nombre] });
  }));
  return [...porId.values()];
}
