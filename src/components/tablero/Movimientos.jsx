import { useState } from 'react';
import { pesos } from '../../lib/pedido.js';
import { fechaCorta } from '../../lib/fechas.js';

const VISIBLES = 6;

// Ingresos y egresos del mes, del más nuevo al más antiguo.
export default function Movimientos({ plantel: p }) {
  const [todos, setTodos] = useState(false);
  const lista = todos ? p.movimientos : p.movimientos.slice(0, VISIBLES);
  return (
    <>
      <section className="card">
        <dl className="total-detalle" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div><dt>Ingresos de octubre</dt><dd className="mov mov-ingreso">{pesos(p.ingresosMes)}</dd></div>
          <div><dt>Egresos de octubre</dt><dd className="mov mov-egreso">{pesos(p.egresosMes)}</dd></div>
        </dl>
      </section>
      <div className="card lista">
        {lista.map((m) => (
          <div key={m.id} className="movimiento">
            <div className="movimiento-que">
              <div>{m.concepto}</div>
              <div className="item-meta" style={{ marginTop: 2 }}>{fechaCorta(m.fecha)}</div>
            </div>
            <div className={`mov mov-${m.tipo}`}>{m.tipo === 'ingreso' ? '+' : '−'}{pesos(m.monto)}</div>
          </div>
        ))}
      </div>
      {p.movimientos.length > VISIBLES && (
        <button type="button" className="filtro" onClick={() => setTodos(!todos)} style={{ marginBottom: 14 }}>
          {todos ? 'Ver menos' : `Ver los ${p.movimientos.length} movimientos`}
        </button>
      )}
    </>
  );
}
