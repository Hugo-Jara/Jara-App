import { useEffect, useState } from 'react';

// Un esquema simple del complejo, visto desde arriba (norte hacia arriba), con la
// cancha del partido resaltada. Está dibujado a partir de la vista satelital de
// cada complejo: no es un plano a escala, solo sirve para ubicarse al llegar.
// Para sumar un complejo: agrega una entrada en ESQUEMAS con sus canchas
// (x, y, ancho, alto, número) y los carteles de calles y acceso.

const ESQUEMAS = {
  // Complejo de los sábados: dos columnas de tres canchas; el acceso y el
  // estacionamiento quedan al este, por la calle Santa Ester.
  sabado: {
    alto: 290,
    canchas: [
      { n: 3, x: 20, y: 36, w: 90, h: 72 }, { n: 2, x: 120, y: 36, w: 90, h: 72 },
      { n: 4, x: 20, y: 118, w: 90, h: 72 }, { n: 1, x: 120, y: 118, w: 90, h: 72 },
      { n: 5, x: 20, y: 200, w: 90, h: 72 }, { n: 6, x: 120, y: 200, w: 90, h: 72 },
    ],
    zonas: [{ x: 222, y: 128, w: 64, h: 104, texto: 'Estaciona-\nmiento' }],
    calles: [
      { x: 0, y: 4, w: 320, h: 20, texto: 'Calle Marcos Goycoolea' },
      { x: 296, y: 30, w: 20, h: 250, texto: 'Santa Ester', vertical: true },
    ],
    entrada: { x: 296, y: 256, texto: 'Entrada' },
    pista: (n) => ({
      6: 'La cancha 6 es la más cercana a la entrada.',
    }[n] ?? 'Las canchas 2, 1 y 6 dan al estacionamiento; la 3, 4 y 5 quedan al otro lado.'),
  },
  // Complejo de los jueves (Huechuraba): cinco canchas en fila, de la 5 (oeste)
  // a la 1 (este); el acceso de la liga queda por el norte, junto a la 4.
  jueves: {
    alto: 210,
    canchas: [
      { n: 5, x: 14, y: 84, w: 58, h: 84 }, { n: 4, x: 78, y: 84, w: 58, h: 84 },
      { n: 3, x: 142, y: 84, w: 58, h: 84 }, { n: 2, x: 206, y: 84, w: 58, h: 84 },
      { n: 1, x: 270, y: 84, w: 58, h: 84 },
    ],
    zonas: [],
    calles: [
      { x: 0, y: 4, w: 320, h: 20, texto: 'Calle Paillacar' },
      { x: 336, y: 30, w: 20, h: 170, texto: 'Av. Santa Rosa', vertical: true },
    ],
    entrada: { x: 107, y: 50, texto: 'Liga (acceso)', arriba: true },
    pista: () => 'Las canchas van en fila, de la 5 (oeste) a la 1 (este). El acceso queda junto a la 4.',
  },
};

function Esquema({ esquema, cancha }) {
  const e = ESQUEMAS[esquema];
  if (!e) return null;
  const n = Number(String(cancha ?? '').match(/\d+/)?.[0]);
  const ancho = esquema === 'jueves' ? 360 : 320;
  const nombreCancha = Number.isFinite(n) ? `cancha ${n}` : 'la cancha';

  return (
    <div className="esquema">
      <div className="sobretitulo">Dónde queda {nombreCancha}</div>
      <svg viewBox={`0 0 ${ancho} ${e.alto}`} role="img"
           aria-label={`Esquema del complejo con ${nombreCancha} resaltada`}>
        {e.calles.map((c) => (
          <g key={c.texto}>
            <rect className="esq-calle" x={c.x} y={c.y} width={c.w} height={c.h} rx="4" />
            <text className="esq-texto" x={c.x + c.w / 2} y={c.y + c.h / 2 + 3.5} textAnchor="middle"
                  transform={c.vertical ? `rotate(90 ${c.x + c.w / 2} ${c.y + c.h / 2})` : undefined}>
              {c.texto}
            </text>
          </g>
        ))}
        {e.zonas.map((z) => (
          <g key={z.texto}>
            <rect className="esq-zona" x={z.x} y={z.y} width={z.w} height={z.h} rx="6" />
            {z.texto.split('\n').map((linea, i) => (
              <text key={linea} className="esq-texto" x={z.x + z.w / 2} y={z.y + z.h / 2 + i * 12 - 2} textAnchor="middle">{linea}</text>
            ))}
          </g>
        ))}
        {e.canchas.map((c) => (
          <g key={c.n} className={c.n === n ? 'esq-activa' : ''}>
            <rect className="esq-cancha" x={c.x} y={c.y} width={c.w} height={c.h} rx="6" />
            <line className="esq-linea" x1={c.x + 6} y1={c.y + c.h / 2} x2={c.x + c.w - 6} y2={c.y + c.h / 2} />
            <text className="esq-numero" x={c.x + c.w / 2} y={c.y + c.h / 2 + 8} textAnchor="middle">{c.n}</text>
          </g>
        ))}
        <g>
          <circle className="esq-entrada" cx={e.entrada.x} cy={e.entrada.y} r="6" />
          <text className="esq-texto esq-etiqueta"
                x={e.entrada.arriba ? e.entrada.x + 12 : e.entrada.x - 10}
                y={e.entrada.y + 4}
                textAnchor={e.entrada.arriba ? 'start' : 'end'}>
            {e.entrada.texto}
          </text>
        </g>
      </svg>
      <p className="conteo">{e.pista(n)} Norte hacia arriba.</p>
    </div>
  );
}

// El valor de "Cancha" como botón: al tocarlo se abre el plano en una ventana.
export default function EsquemaCanchas({ esquema, cancha }) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (!abierto) return undefined;
    const alTecla = (e) => { if (e.key === 'Escape') setAbierto(false); };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [abierto]);
  if (!ESQUEMAS[esquema]) return <>{cancha}</>;
  return (
    <>
      <button type="button" className="enlace" onClick={() => setAbierto(true)}>{cancha} · ver plano</button>
      {abierto && (
        <div className="ventana-fondo" onClick={() => setAbierto(false)}>
          <div className="ventana card" role="dialog" aria-modal="true" aria-label="Plano del complejo"
               onClick={(e) => e.stopPropagation()}>
            <Esquema esquema={esquema} cancha={cancha} />
            <button type="button" className="btn secundario" style={{ marginTop: 12 }} onClick={() => setAbierto(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </>
  );
}
