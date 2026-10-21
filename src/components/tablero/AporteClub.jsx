import { pesos } from '../../lib/pedido.js';
import { fechaCorta } from '../../lib/fechas.js';

// Lo que el plantel le debe entregar al club según sus jugadores, y lo que lleva entregado.
export default function AporteClub({ aporte, mostrarEntregas = true }) {
  const pct = aporte.comprometido > 0 ? Math.min(100, Math.round((aporte.entregado / aporte.comprometido) * 100)) : 0;
  return (
    <section className="card">
      <div className="sobretitulo">Aporte al club</div>
      <div className="progreso-texto">
        Entregado {pesos(aporte.entregado)} <span>{pct}%</span>
      </div>
      <div className="progreso"><div style={{ width: `${pct}%` }} /></div>
      <dl className="total-detalle" style={{ marginTop: 14, gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div><dt>Corresponde</dt><dd>{pesos(aporte.comprometido)}</dd></div>
        <div><dt>Falta entregar</dt><dd className={aporte.pendiente > 0 ? 'mov mov-egreso' : ''}>{pesos(aporte.pendiente)}</dd></div>
      </dl>
      {mostrarEntregas && aporte.entregas.length > 0 && (
        <ul className="entregas">
          {aporte.entregas.map((e) => (
            <li key={e.id}><span>{fechaCorta(e.fecha)}</span><span>{pesos(e.monto)}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}
