import { pesos } from '../../lib/pedido.js';

// Vista de Hacienda: los tres planteles lado a lado, el total del club y
// Entrenamiento como línea aparte (solo lectura, sin aporte por jugador).
export default function ConsolidadoHacienda({ planteles, consolidado, entrenamiento, onAbrir }) {
  return (
    <>
      <section className="card total">
        <div className="sobretitulo">Los tres planteles</div>
        <div className="total-monto display">{pesos(consolidado.saldo)}</div>
        <p className="item-meta" style={{ marginTop: 0 }}>plata disponible entre los planteles</p>
        <dl className="total-detalle" style={{ marginTop: 14 }}>
          <div><dt>Por recaudar</dt><dd>{pesos(consolidado.porRecaudar)}</dd></div>
          <div><dt>Aporte entregado</dt><dd>{pesos(consolidado.aporte.entregado)}</dd></div>
          <div><dt>Aporte pendiente</dt><dd>{pesos(consolidado.aporte.pendiente)}</dd></div>
        </dl>
      </section>

      <h2 className="seccion">Por plantel</h2>
      {planteles.map((p) => (
        <button key={p.id} type="button" className="card plantel-resumen" onClick={() => onAbrir(p.id)}>
          <div className="item-cabeza">
            <div className="item-que">{p.nombre}</div>
            <span className="enlace">Ver tablero ›</span>
          </div>
          <dl className="total-detalle" style={{ marginTop: 12 }}>
            <div><dt>Saldo</dt><dd>{pesos(p.saldo)}</dd></div>
            <div><dt>Por recaudar</dt><dd>{pesos(p.porRecaudar)}</dd></div>
            <div><dt>Al día</dt><dd>{p.alDia} de {p.jugadores.length}</dd></div>
          </dl>
          <dl className="total-detalle" style={{ marginTop: 10, gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div><dt>Aporte entregado</dt><dd>{pesos(p.aporte.entregado)}</dd></div>
            <div><dt>Falta entregar</dt><dd className={p.aporte.pendiente > 0 ? 'mov mov-egreso' : ''}>{pesos(p.aporte.pendiente)}</dd></div>
          </dl>
        </button>
      ))}

      <h2 className="seccion">Aparte</h2>
      <section className="card">
        <div className="item-cabeza">
          <div className="item-que">{entrenamiento.nombre}</div>
          <span className="etiqueta">Solo lectura</span>
        </div>
        <p className="item-meta">Lo administra su propio encargado. No entrega aporte por jugador.</p>
        <dl className="total-detalle" style={{ marginTop: 12 }}>
          <div><dt>Ingresos</dt><dd>{pesos(entrenamiento.ingresos)}</dd></div>
          <div><dt>Egresos</dt><dd>{pesos(entrenamiento.egresos)}</dd></div>
          <div><dt>Saldo</dt><dd>{pesos(entrenamiento.saldo)}</dd></div>
        </dl>
        <ul className="entregas">
          {entrenamiento.ingresosTemporada.map((x) => <li key={x.concepto}><span>{x.concepto}</span><span className="mov mov-ingreso">+{pesos(x.monto)}</span></li>)}
          {entrenamiento.egresosTemporada.map((x) => <li key={x.concepto}><span>{x.concepto}</span><span className="mov mov-egreso">−{pesos(x.monto)}</span></li>)}
        </ul>
      </section>
    </>
  );
}
