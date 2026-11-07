import { useRef, useState } from 'react';
import { ampliarMarco, limitar, marcoFoto, moverMarco } from '../../lib/boletinEncuadre.js';

export default function EncuadreFoto({ foto, relacion, cambiar }) {
  const [dimensiones, setDimensiones] = useState(null);
  const area = useRef(null), puntos = useRef(new Map()), gesto = useRef(null), vigente = useRef(foto);
  vigente.current = foto;
  const marco = dimensiones && marcoFoto(dimensiones.w, dimensiones.h, relacion, foto);
  function comenzarGesto() {
    const valores = [...puntos.current.values()], f = vigente.current;
    if (!valores.length || !dimensiones) { gesto.current = null; return; }
    gesto.current = { inicial: { x: f.x, y: f.y, zoom: f.zoom }, marco: marcoFoto(dimensiones.w, dimensiones.h, relacion, f), puntos: valores.map(p => ({ ...p })) };
  }
  function mover(e) {
    if (!puntos.current.has(e.pointerId) || !gesto.current || !area.current) return;
    puntos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const valores = [...puntos.current.values()], g = gesto.current, rect = area.current.getBoundingClientRect();
    if (valores.length >= 2 && g.puntos.length >= 2) {
      const distancia = a => Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      const d = distancia(g.puntos);
      if (d > 0) cambiar(ampliarMarco(dimensiones.w, dimensiones.h, relacion, g.inicial, limitar(g.inicial.zoom * distancia(valores) / d, 1, 3)));
    } else if (valores.length === 1 && g.puntos.length === 1) {
      cambiar(moverMarco(g.marco, (valores[0].x - g.puntos[0].x) / rect.width, (valores[0].y - g.puntos[0].y) / rect.height));
    }
  }
  return <div className="noticias-encuadre">
    <p className="noticias-ayuda">{foto.mostrarCompleta ? 'Se mostrará toda la fotografía.' : 'Mueve el marco con un dedo. Separa o junta dos dedos para ampliar o alejar.'}</p>
    <div className="noticias-encuadre-imagen" ref={area}>
      <img src={foto.src} alt={foto.pie || 'Fotografía completa para encuadrar'} onLoad={e => setDimensiones({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} draggable="false" />
      {marco && !foto.mostrarCompleta && <div className="noticias-encuadre-marco" style={{ left: `${marco.x * 100}%`, top: `${marco.y * 100}%`, width: `${marco.w * 100}%`, height: `${marco.h * 100}%` }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); puntos.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); comenzarGesto(); }}
        onPointerMove={mover}
        onPointerUp={e => { puntos.current.delete(e.pointerId); comenzarGesto(); }}
        onPointerCancel={e => { puntos.current.delete(e.pointerId); comenzarGesto(); }} />}
    </div>
  </div>;
}
