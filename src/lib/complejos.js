// Dónde juega cada plantel. Cada plantel juega siempre en el mismo complejo,
// así que el lugar se asocia al plantel (por nombre) y no a cada partido.
// Para sumar un complejo: agrega un bloque con los nombres de los planteles que
// juegan ahí, su esquema (ver EsquemaCanchas) y cómo llegar: coordenadas
// (latitud, longitud) tal como las da Waze o Google Maps, o un link de Google Maps.

const COMPLEJOS = [
  {
    nombre: 'Complejo de los sábados',
    equipos: ['Senior Sábado', 'Junior Sábado'],
    esquema: 'sabado',
    lat: -33.214052,
    lng: -70.702407,
  },
  {
    nombre: 'Complejo de los jueves (Huechuraba)',
    equipos: ['Senior Jueves'],
    esquema: 'jueves',
    // Solo tenemos el link de Google Maps; el de Waze se suma cuando se comparta.
    mapas: 'https://goo.gl/maps/9xFVDzeif7GqYRAG8',
  },
];

const enlaces = (c) => ({
  waze: c.lat != null ? `https://waze.com/ul?ll=${c.lat}%2C${c.lng}&navigate=yes` : null,
  mapas: c.mapas ?? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`,
});

// Devuelve { nombre, esquema, waze, mapas } para el plantel, o null si aún no está cargado.
export function complejoDe(equipo) {
  const c = COMPLEJOS.find((x) => x.equipos.includes(equipo));
  return c ? { nombre: c.nombre, esquema: c.esquema, ...enlaces(c) } : null;
}
