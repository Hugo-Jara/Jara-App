import { pesos } from '../../lib/pedido.js';
import { plural } from '../../lib/texto.js';

// Saldo, por recaudar e ingresos y egresos de un plantel ya calculado.
export default function ResumenPlantel({ plantel: p, temporada }) {
  return (
    <>
      <section className="card total">
        <div className="sobretitulo">Plata disponible</div>
        <div className="total-monto display">{pesos(p.saldo)}</div>
        <p className="item-meta" style={{ marginTop: 0 }}>{temporada.nombre} acumulada hasta octubre</p>
        <dl className="total-detalle" style={{ marginTop: 14 }}>
          <div><dt>Ingresos</dt><dd>{pesos(p.ingresosTemporada)}</dd></div>
          <div><dt>Egresos</dt><dd>{pesos(p.egresosTemporada)}</dd></div>
          <div><dt>Cuota mensual</dt><dd>{pesos(p.cuotaMensual)}</dd></div>
        </dl>
      </section>

      <section className="card">
        <div className="sobretitulo">Por recaudar</div>
        <div className="total-monto display">{pesos(p.porRecaudar)}</div>
        <p className="item-meta" style={{ marginTop: 0 }}>
          {plural(p.jugadores.length - p.alDia, 'jugador debe', 'jugadores deben')} cuotas; {p.alDia} de {p.jugadores.length} están al día.
        </p>
        <div className="progreso">
          <div style={{ width: `${p.cobrado + p.porRecaudar > 0 ? Math.round((p.cobrado / (p.cobrado + p.porRecaudar)) * 100) : 0}%` }} />
        </div>
        <p className="item-meta">Cobrado {pesos(p.cobrado)} de {pesos(p.cobrado + p.porRecaudar)} que correspondía hasta octubre.</p>
      </section>
    </>
  );
}
