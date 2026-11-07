// Geometría compartida por el encuadre y el tamaño de la fotografía en el PNG.
export function relacionFoto(tipo, disposicion = 'abajo', indice = 0, cantidad = 1) {
  const anchoNota = tipo === 'columnas' ? 574 : 1188;
  const lateral = /^(lado|rodear)_/.test(disposicion);
  let ancho;
  if (indice === 0 && disposicion !== 'abajo') ancho = lateral ? Math.floor(anchoNota * .4) : anchoNota;
  else {
    const restantes = disposicion === 'abajo' ? cantidad : cantidad - 1;
    const posicion = disposicion === 'abajo' ? indice : indice - 1;
    const pares = posicion % 2 === 0 && posicion + 1 < restantes || posicion % 2 === 1;
    ancho = pares ? (anchoNota - 14) / 2 : anchoNota;
  }
  return ancho / Math.min(350, ancho * .7);
}
export const limitar = (n, a, b) => Math.max(a, Math.min(b, n));
export function marcoFoto(ancho, alto, relacion, foto) {
  const recorteAncho = Math.min(ancho, alto * relacion) / foto.zoom;
  const recorteAlto = recorteAncho / relacion;
  const w = recorteAncho / ancho, h = recorteAlto / alto;
  return { w, h, x: (1 - w) * foto.x / 100, y: (1 - h) * foto.y / 100 };
}
export function moverMarco(marco, dx, dy) {
  return { x: marco.w >= .999999 ? 50 : limitar((marco.x + dx) / (1 - marco.w) * 100, 0, 100),
    y: marco.h >= .999999 ? 50 : limitar((marco.y + dy) / (1 - marco.h) * 100, 0, 100) };
}
export function ampliarMarco(ancho, alto, relacion, inicial, zoom) {
  const previo = marcoFoto(ancho, alto, relacion, inicial);
  const z = limitar(zoom, 1, 3), siguiente = marcoFoto(ancho, alto, relacion, { ...inicial, zoom: z });
  const x = previo.x + previo.w / 2 - siguiente.w / 2, y = previo.y + previo.h / 2 - siguiente.h / 2;
  return { ...moverMarco(siguiente, x - siguiente.x, y - siguiente.y), zoom: z };
}
