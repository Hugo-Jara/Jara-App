import { useEffect, useRef, useState } from 'react';

// Antes de subir la foto de perfil: la persona la mueve con el dedo y la
// acerca o aleja (pellizcando, con la barra o con − y +) hasta que la cara
// quede dentro del círculo. Devuelve el recorte cuadrado en píxeles de la foto
// original: { sx, sy, lado }.
const ZOOM_MAX = 4;

export default function EncuadrarFoto({ archivo, onListo, onCancelar }) {
  const lienzo = useRef(null);
  const [bmp, setBmp] = useState(null);
  const [error, setError] = useState('');
  const [visor] = useState(() => Math.max(200, Math.min(320, (window.innerWidth || 360) - 72)));
  // zoom 1 = el lado corto llena el círculo; x, y = cuánto se corrió la foto (px del visor).
  const [vista, setVista] = useState({ zoom: 1, x: 0, y: 0 });
  const dedos = useRef(new Map());
  const gesto = useRef(null);

  useEffect(() => {
    let vivo = true;
    let abierto = null;
    createImageBitmap(archivo)
      .then((b) => {
        if (!vivo) { b.close?.(); return; }
        abierto = b;
        setBmp(b);
        // Partimos un poco hacia arriba en fotos verticales: ahí suele estar la cara.
        const escala = visor / Math.min(b.width, b.height);
        const sobra = (b.height * escala - visor) / 2;
        setVista(ajustar({ zoom: 1, x: 0, y: sobra * 0.5 }, b, visor));
      })
      .catch(() => vivo && setError('No pudimos abrir esa foto. Prueba con otra (JPG o PNG).'));
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { vivo = false; abierto?.close?.(); document.body.style.overflow = antes; };
  }, [archivo, visor]);

  // Dibuja la foto y, encima, la sombra con el círculo que quedará de foto.
  useEffect(() => {
    const c = lienzo.current;
    if (!c || !bmp) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.height = Math.round(visor * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = escalaDe(vista.zoom, bmp, visor);
    const w = bmp.width * s, h = bmp.height * s;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, visor, visor);
    ctx.drawImage(bmp, visor / 2 + vista.x - w / 2, visor / 2 + vista.y - h / 2, w, h);
    ctx.beginPath();
    ctx.rect(0, 0, visor, visor);
    ctx.arc(visor / 2, visor / 2, visor / 2 - 1, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fill('evenodd');
    ctx.beginPath();
    ctx.arc(visor / 2, visor / 2, visor / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(198, 161, 91, 0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [bmp, vista, visor]);

  const cambiar = (f) => setVista((v) => ajustar(typeof f === 'function' ? f(v) : f, bmp, visor));

  // Acercar manteniendo fijo un punto del visor (el centro, o entre los dedos).
  const zoomEn = (v, zoom, px = visor / 2, py = visor / 2) => {
    const z = Math.min(ZOOM_MAX, Math.max(1, zoom));
    const r = z / v.zoom;
    const dx = px - visor / 2, dy = py - visor / 2;
    return { zoom: z, x: dx - (dx - v.x) * r, y: dy - (dy - v.y) * r };
  };

  const punto = (e) => {
    const r = lienzo.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const inicioGesto = () => {
    const p = [...dedos.current.values()];
    if (p.length === 1) gesto.current = { tipo: 'mover', desde: p[0], vista };
    else if (p.length >= 2) {
      gesto.current = {
        tipo: 'pellizco', vista,
        dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1,
        medio: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 },
      };
    } else gesto.current = null;
  };
  const abajo = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dedos.current.set(e.pointerId, punto(e));
    inicioGesto();
  };
  const mover = (e) => {
    if (!dedos.current.has(e.pointerId) || !gesto.current) return;
    dedos.current.set(e.pointerId, punto(e));
    const g = gesto.current;
    const p = [...dedos.current.values()];
    if (g.tipo === 'mover' && p.length === 1) {
      cambiar({ ...g.vista, x: g.vista.x + p[0].x - g.desde.x, y: g.vista.y + p[0].y - g.desde.y });
    } else if (g.tipo === 'pellizco' && p.length >= 2) {
      const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const medio = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
      const z = zoomEn(g.vista, g.vista.zoom * dist / g.dist, g.medio.x, g.medio.y);
      cambiar({ ...z, x: z.x + medio.x - g.medio.x, y: z.y + medio.y - g.medio.y });
    }
  };
  const arriba = (e) => {
    dedos.current.delete(e.pointerId);
    inicioGesto();
  };
  const rueda = (e) => {
    const p = punto(e);
    cambiar((v) => zoomEn(v, v.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), p.x, p.y));
  };

  const listo = () => {
    const s = escalaDe(vista.zoom, bmp, visor);
    const lado = visor / s;
    const cx = bmp.width / 2 - vista.x / s, cy = bmp.height / 2 - vista.y / s;
    onListo({
      sx: Math.max(0, Math.min(bmp.width - lado, cx - lado / 2)),
      sy: Math.max(0, Math.min(bmp.height - lado, cy - lado / 2)),
      lado: Math.min(lado, bmp.width, bmp.height),
    });
  };

  return (
    <div className="ventana-fondo encuadre-fondo" role="dialog" aria-modal="true" aria-labelledby="encuadre-titulo">
      <div className="card ventana encuadre">
        <h2 id="encuadre-titulo" className="encuadre-titulo">Encuadra tu foto</h2>
        <p className="encuadre-ayuda">Mueve la foto con el dedo y pellizca para acercar o alejar. Lo que quede dentro del círculo será tu foto.</p>
        {error ? <p className="error" role="alert">{error}</p> : (
          <>
            <canvas
              ref={lienzo}
              className="encuadre-lienzo"
              style={{ width: visor, height: visor }}
              aria-label="Vista previa de tu foto"
              onPointerDown={abajo} onPointerMove={mover} onPointerUp={arriba} onPointerCancel={arriba}
              onWheel={rueda}
            />
            <div className="encuadre-zoom">
              <button type="button" className="btn chico secundario" aria-label="Alejar" disabled={!bmp || vista.zoom <= 1} onClick={() => cambiar((v) => zoomEn(v, v.zoom / 1.25))}>−</button>
              <input
                type="range" min="1" max={ZOOM_MAX} step="0.01" value={vista.zoom} disabled={!bmp}
                aria-label="Acercar o alejar" onChange={(e) => cambiar((v) => zoomEn(v, Number(e.target.value)))}
              />
              <button type="button" className="btn chico secundario" aria-label="Acercar" disabled={!bmp || vista.zoom >= ZOOM_MAX} onClick={() => cambiar((v) => zoomEn(v, v.zoom * 1.25))}>+</button>
            </div>
          </>
        )}
        <div className="encuadre-botones">
          <button type="button" className="btn secundario" onClick={onCancelar}>Cancelar</button>
          <button type="button" className="btn" disabled={!bmp} onClick={listo}>Usar esta foto</button>
        </div>
      </div>
    </div>
  );
}

function escalaDe(zoom, bmp, visor) {
  return (visor / Math.min(bmp.width, bmp.height)) * zoom;
}

// La foto nunca deja hueco dentro del cuadro.
function ajustar(v, bmp, visor) {
  if (!bmp) return v;
  const zoom = Math.min(ZOOM_MAX, Math.max(1, v.zoom));
  const s = escalaDe(zoom, bmp, visor);
  const mx = Math.max(0, (bmp.width * s - visor) / 2);
  const my = Math.max(0, (bmp.height * s - visor) / 2);
  return { zoom, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) };
}
