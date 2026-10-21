import { useState } from 'react';
import { pesos } from '../../lib/pedido.js';
import { plural } from '../../lib/texto.js';

const INICIAL = { '03': 'M', '04': 'A', '05': 'M', '06': 'J', '07': 'J', '08': 'A', '09': 'S', '10': 'O', '11': 'N', '12': 'D' };
const NOMBRE_MES = { '03': 'marzo', '04': 'abril', '05': 'mayo', '06': 'junio', '07': 'julio', '08': 'agosto', '09': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre' };
const mesDe = (iso) => iso.slice(5);

const FILTROS = [
  { id: 'todos', nombre: 'Todos' },
  { id: 'deben', nombre: 'Deben' },
  { id: 'aldia', nombre: 'Al día' },
];

function textoEstado(j) {
  return j.alDia ? 'Al día' : `Debe ${plural(j.mesesDebe.length, 'mes', 'meses')}`;
}

// Quién pagó y quién no: una fila por jugador con su grilla de cuotas del año.
export default function ListaCuotas({ jugadores, mesActual }) {
  const [filtro, setFiltro] = useState('todos');
  const visibles = jugadores.filter((j) => filtro === 'todos' || (filtro === 'aldia' ? j.alDia : !j.alDia));
  return (
    <>
      <div className="filtros" role="tablist" aria-label="Filtrar jugadores">
        {FILTROS.map((f) => (
          <button key={f.id} type="button" className={`filtro${filtro === f.id ? ' activo' : ''}`} onClick={() => setFiltro(f.id)}>
            {f.nombre}
          </button>
        ))}
      </div>
      <div className="card lista">
        {visibles.length === 0 && <p className="item-meta" style={{ padding: '14px 0' }}>Nadie en esta lista.</p>}
        {visibles.map((j) => (
          <div key={j.id} className="cuotas-jugador">
            <div className="item-cabeza">
              <div className="item-que">{j.nombre}</div>
              <span className={`ef ${j.alDia ? 'al_dia' : 'excedido'}`}>{textoEstado(j)}</span>
            </div>
            <div className="cuotas-grilla" role="img"
              aria-label={`Cuotas de ${j.nombre}: ${j.cuotas.map((c) => `${NOMBRE_MES[mesDe(c.mes)]} ${c.mes > mesActual ? 'aún no se cobra' : c.pagado ? 'pagada' : 'pendiente'}`).join(', ')}`}>
              {j.cuotas.map((c) => (
                <span key={c.mes} className={`cuota ${c.mes > mesActual ? 'futura' : c.pagado ? 'pagada' : 'debe'}`}>
                  {INICIAL[mesDe(c.mes)]}
                </span>
              ))}
            </div>
            {!j.alDia && <div className="item-meta">Debe {pesos(j.deuda)}: {j.mesesDebe.map((m) => NOMBRE_MES[mesDe(m)]).join(', ')}.</div>}
          </div>
        ))}
      </div>
      <p className="leyenda-cuotas">
        <span className="cuota pagada" /> pagada <span className="cuota debe" /> pendiente <span className="cuota futura" /> aún no se cobra
      </p>
    </>
  );
}
