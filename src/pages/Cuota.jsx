import { useMiCuota, ESTADO_CARGO, MEDIOS, TEMPORADA } from '../lib/tesoreria.js';
import { pesos } from '../lib/pedido.js';

// Mi cuota: lo que debo y lo que he pagado en cada plantel. Lo ve solo la
// propia persona (mi_tesoreria, migración 0023); el tesorero lo ve desde Tesorería.
const fechaCl = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('-') : '');

export default function Cuota() {
  const { cargando, error, planteles } = useMiCuota();
  return (
    <>
      <h1 className="titulo display">Mi cuota</h1>
      <p className="subtitulo">Temporada {TEMPORADA}. Lo ves solo tú, tu tesorero y Hacienda.</p>
      {cargando && <div className="cargando">Cargando…</div>}
      {error && <p className="error">{error}</p>}
      {!cargando && !error && planteles.length === 0 && (
        <section className="card">
          <p className="item-meta" style={{ marginTop: 0 }}>Tu plantel todavía no carga sus cuotas en la app. Cuando el tesorero las suba, aquí verás qué tienes pagado y qué viene.</p>
        </section>
      )}
      {planteles.map((p) => {
        const j = p.estado;
        return (
          <div key={p.equipo}>
            {planteles.length > 1 && <h2 className="seccion">{p.nombre}</h2>}
            <section className="card total">
              <div className="sobretitulo">{j.deudaVencida > 0 ? 'Tienes pendiente' : 'Estás al día'}</div>
              <div className="total-monto display">{pesos(j.deudaVencida)}</div>
              <dl className="total-detalle">
                <div><dt>Temporada</dt><dd>{pesos(j.total)}</dd></div>
                <div><dt>Pagado</dt><dd>{pesos(j.pagado)}</dd></div>
                <div><dt>Próxima</dt><dd>{j.proximo ? fechaCl(j.proximo.vence) : '—'}</dd></div>
              </dl>
              {j.proximo && <p className="item-meta">Próxima: {j.proximo.nombre}, {pesos(j.proximo.monto - j.proximo.pagado)}.</p>}
            </section>
            <h2 className="seccion">Cuotas y cargos</h2>
            <section className="card">
              {j.cargos.length === 0 && <p className="item-meta" style={{ marginTop: 0 }}>Sin cargos esta temporada.</p>}
              <ul className="movimientos">
                {j.cargos.map((c) => (
                  <li key={c.id}>
                    <span className="mov-texto">
                      <span>{c.nombre}</span>
                      <span className="item-meta" style={{ marginTop: 0 }}>
                        vence {fechaCl(c.vence)} · <span className={`ef ${c.estado === 'pagado' ? 'al_dia' : c.estado === 'vencido' ? 'excedido' : 'pendiente'}`}>{ESTADO_CARGO[c.estado]}</span>
                      </span>
                    </span>
                    <span className="mov-monto">{pesos(c.monto)}</span>
                  </li>
                ))}
              </ul>
            </section>
            {j.pagos.length > 0 && (
              <>
                <h2 className="seccion">Mis pagos</h2>
                <section className="card">
                  <ul className="movimientos">
                    {j.pagos.filter((g) => !g.anulado).map((g) => (
                      <li key={g.id}>
                        <span>{fechaCl(g.fecha)} · {MEDIOS[g.medio] ?? g.medio}</span>
                        <span className="mov-monto entra">{pesos(g.monto)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </div>
        );
      })}
      <p className="nota">¿Algo no cuadra? Escríbele al tesorero de tu plantel con tu comprobante.</p>
    </>
  );
}
