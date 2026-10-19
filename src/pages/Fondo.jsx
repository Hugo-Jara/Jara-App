import { useState } from 'react';
import { useFondo, FONDO, TOPICOS, ITEMS, PAGOS, ESTADOS, DUDAS, respaldosDe, motivoNoRendible } from '../lib/fondo.js';
import { pesos } from '../lib/pedido.js';
import { fechaCorta, hoyIso } from '../lib/fechas.js';
import { plural } from '../lib/texto.js';
import { ESCUDO } from '../lib/base.js';

// Fondo Las Condes 2026 · VISTA PREVIA. Página suelta (como el pedido de
// compras): se abre con el link, sin cuenta, porque solo tiene datos de
// ejemplo. Sirve para mostrarle el flujo al equipo que ejecuta el fondo.

const VISTAS = [
  { id: 'panel', nombre: 'Panel' },
  { id: 'compras', nombre: 'Compras' },
  { id: 'honorarios', nombre: 'Honorarios' },
  { id: 'rendiciones', nombre: 'Rendiciones' },
  { id: 'dudas', nombre: 'Dudas' },
];
const SITUACION = { sin_gastos: 'Sin gastos', al_dia: 'Al día', faltan: 'Faltan respaldos', excedido: 'Excedido' };
const nombreItem = (id) => ITEMS.find((i) => i.id === id)?.nombre ?? 'Fuera del presupuesto';
const fechaPlanilla = (iso) => (iso ? iso.split('-').reverse().join('-') : '');
const porcentaje = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);

function Panel({ f }) {
  return (
    <>
      <section className="card total">
        <div className="sobretitulo">Gastado del fondo</div>
        <div className="total-monto display">{pesos(f.gastado)}</div>
        <p className="item-meta" style={{ marginTop: 0 }}>de {pesos(FONDO.municipio)} que entrega la Municipalidad</p>
        <div className="progreso"><div style={{ width: `${porcentaje(f.gastado, FONDO.municipio)}%` }} /></div>
        <dl className="total-detalle" style={{ marginTop: 14 }}>
          <div><dt>Disponible</dt><dd>{pesos(f.disponible)}</dd></div>
          <div><dt>Aporte club</dt><dd>{pesos(FONDO.aportePropio)}</dd></div>
          <div><dt>Período</dt><dd>1 oct – 28 dic</dd></div>
        </dl>
      </section>

      <h2 className="seccion">Por ítem del presupuesto</h2>
      {f.porItem.map((it) => (
        <section key={it.id} className="card fondo-item">
          <div className="item-cabeza">
            <div className="item-que">{it.nombre}</div>
            <span className={`ef ${it.situacion}`}>{SITUACION[it.situacion]}</span>
          </div>
          <div className="item-meta">{it.detalle}</div>
          <dl className="total-detalle" style={{ marginTop: 12 }}>
            <div><dt>Aprobado</dt><dd>{pesos(it.aprobado)}</dd></div>
            <div><dt>Gastado</dt><dd>{pesos(it.gastado)}</dd></div>
            <div><dt>Disponible</dt><dd>{pesos(it.disponible)}</dd></div>
          </dl>
          {it.aprobado > 0 && (
            <div className="progreso"><div className={it.excedido ? 'excedido' : ''} style={{ width: `${porcentaje(it.gastado, it.aprobado)}%` }} /></div>
          )}
          {it.excedido > 0 && (
            <p className="item-comentario">Se pasó por {pesos(it.excedido)}. Eso no se rinde: lo pone el club como aporte propio (art. 6).</p>
          )}
        </section>
      ))}

      <h2 className="seccion">Documentos del fondo</h2>
      <section className="card">
        <Checklist filas={f.documentos.map((d) => ({ ...d, marcado: d.listo }))}
                   marcar={(id, v) => f.marcarDocumento(id, v)} />
      </section>

      <p className="nota">
        Quién ve el fondo: el administrador del fondo, el tesorero y el presidente. En la versión real, cada uno con su cuenta de la app,
        y los archivos en un lugar privado.
      </p>
    </>
  );
}

function Checklist({ filas, marcar }) {
  return (
    <ul className="checklist">
      {filas.map((r) => (
        <li key={r.id}>
          <label className="casilla">
            <input type="checkbox" checked={!!r.marcado} onChange={(e) => marcar(r.id, e.target.checked)} />
            <span>
              <span className="checklist-nombre">{r.nombre}</span>
              {r.nota && <span className="checklist-nota">{r.nota}</span>}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function Compra({ c, f, abierta, alternar }) {
  const motivo = motivoNoRendible(c);
  const respaldos = respaldosDe(c);
  const listos = respaldos.filter((r) => c.respaldos[r.id]).length;
  return (
    <li className="item">
      <button type="button" className="item-boton" onClick={alternar} aria-expanded={abierta}>
        <div className="item-cabeza">
          <div className="item-que">{c.que}</div>
          <div className="item-monto">{pesos(c.monto)}</div>
        </div>
        <div className="item-meta">
          {c.item !== 'personal' && <>{nombreItem(c.item)} · </>}
          <span className={`ef ${c.estado}`}>{ESTADOS[c.estado]}</span>
          {c.estado !== 'no_rendible' && <> · {listos} de {respaldos.length} respaldos</>}
        </div>
      </button>

      {abierta && (
        <div className="compra-detalle">
          {motivo && <p className="item-comentario">{motivo} Lo paga el club.</p>}
          <dl className="datos">
            <div><dt>Proveedor</dt><dd>{c.proveedor || '—'}</dd></div>
            <div><dt>Boleta o factura</dt><dd>{c.documento ? `N° ${c.documento}` : 'Pendiente'}</dd></div>
            <div><dt>Fecha de emisión</dt><dd>{c.fecha ? fechaCorta(c.fecha) : '—'}</dd></div>
            <div><dt>Ítem</dt><dd>{nombreItem(c.item)}</dd></div>
          </dl>
          <label htmlFor={`pago-${c.id}`}>¿Cómo se pagó?</label>
          <select id={`pago-${c.id}`} value={c.pago ?? ''} onChange={(e) => f.cambiarPago(c.id, e.target.value)}>
            <option value="">Todavía no se paga</option>
            {Object.entries(PAGOS).map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
          </select>
          <h3 className="grupo-titulo pendiente" style={{ marginTop: 18 }}>Respaldos</h3>
          <Checklist filas={respaldos.map((r) => ({ ...r, marcado: c.respaldos[r.id] }))}
                     marcar={(id, v) => f.marcarRespaldo(c.id, id, v)} />
          {c.estado === 'lista' && <p className="respuesta">Lista para rendir: todos los respaldos y pagada con la cuenta del club.</p>}
          {c.estado === 'rendida' && <p className="respuesta">Ya está incluida en una rendición presentada.</p>}
        </div>
      )}
    </li>
  );
}

function Agregar({ f, listo }) {
  const [topico, setTopico] = useState('fondo');
  const [item, setItem] = useState('bienes');
  const [que, setQue] = useState('');
  const [monto, setMonto] = useState('');
  const [pago, setPago] = useState('');
  const [entrega, setEntrega] = useState(false);
  const [aviso, setAviso] = useState('');

  if (aviso) {
    return (
      <section className="card">
        <p className="respuesta sin-margen">{aviso}</p>
        <button className="btn secundario" style={{ marginTop: 14 }} onClick={listo}>Volver a las compras</button>
      </section>
    );
  }

  const n = Number(String(monto).replace(/\D/g, '')) || 0;
  const it = f.porItem.find((i) => i.id === item);
  const pasa = it ? Math.max(0, n - it.disponible) : 0;
  const guardar = (e) => {
    e.preventDefault();
    f.agregar({ item, que: que.trim(), monto: n, proveedor: '', documento: '', fecha: hoyIso(), pago: pago || null, entrega });
    listo();
  };

  return (
    <form className="card" onSubmit={guardar}>
      <div className="sobretitulo">Agregar compra</div>
      <label>¿Para qué es esta compra?</label>
      <div className="opciones-topico">
        {TOPICOS.map((t) => (
          <button type="button" key={t.id} className={`opcion ${topico === t.id ? 'activa' : ''}`} onClick={() => setTopico(t.id)}>
            <span className="opcion-nombre">{t.nombre}</span>
            <span className="opcion-detalle">{t.desc}</span>
          </button>
        ))}
      </div>

      {topico !== 'fondo' ? (
        <>
          <p className="item-meta" style={{ marginTop: 14 }}>
            Esta compra sigue el camino de siempre (el pedido de compras) y no toca el fondo ni sus alertas.
          </p>
          <button type="button" className="btn secundario" style={{ marginTop: 14 }} onClick={listo}>Entendido</button>
        </>
      ) : (
        <>
          <label htmlFor="f-item">Ítem del presupuesto</label>
          <select id="f-item" value={item} onChange={(e) => setItem(e.target.value)}>
            {ITEMS.filter((i) => i.id !== 'personal').map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            <option value="fuera">No está en el presupuesto</option>
          </select>
          <p className="item-meta">Los honorarios del entrenador van en su pestaña. No se rinden multas, intereses ni impuestos (art. 11).</p>

          {item === 'fuera' ? (
            <>
              <p className="item-comentario">
                No está en el presupuesto aprobado. Solo se rinden los ítems del proyecto: si se compra, no se rinde y lo paga el club.
              </p>
              <button type="button" className="btn secundario" style={{ marginTop: 14 }}
                      onClick={() => setAviso('Listo: la compra quedaría en «Gastos generales del club», sin cargo al fondo.')}>
                Agregar igual, sin cargo al fondo
              </button>
            </>
          ) : (
            <>
              <label htmlFor="f-que">¿Qué se compra?</label>
              <input id="f-que" required minLength={3} value={que} onChange={(e) => setQue(e.target.value)} placeholder="Por ejemplo: balones (22)" />
              <label htmlFor="f-monto">Monto con IVA</label>
              <input id="f-monto" required inputMode="numeric" value={monto ? pesos(n) : ''}
                     onChange={(e) => setMonto(e.target.value.replace(/\D/g, ''))} placeholder="$0" />
              <p className="item-meta">Con IVA, porque es lo que dirá la boleta. Disponible en este ítem: <strong>{pesos(it?.disponible ?? 0)}</strong></p>
              {pasa > 0 && <p className="item-comentario">Pasa lo disponible por {pesos(pasa)}. Esa parte no se rinde: la pone el club.</p>}
              <label htmlFor="f-pago">¿Cómo se va a pagar?</label>
              <select id="f-pago" value={pago} onChange={(e) => setPago(e.target.value)}>
                <option value="">Todavía no se sabe</option>
                {Object.entries(PAGOS).map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
              </select>
              {pago === 'particular' && <p className="item-comentario">Así no se puede rendir (art. 9): solo pagos con la cuenta o el débito del club.</p>}
              <label className="casilla">
                <input type="checkbox" checked={entrega} onChange={(e) => setEntrega(e.target.checked)} />
                Se entrega a los participantes (pide nómina firmada, art. 10)
              </label>
              <div className="botones">
                <button className="btn">Agregar al fondo</button>
                <button type="button" className="btn secundario" onClick={listo}>Cancelar</button>
              </div>
            </>
          )}
        </>
      )}
    </form>
  );
}

function Hoja({ f, rendicion, compras, volver }) {
  const total = compras.reduce((t, c) => t + c.monto, 0);
  return (
    <>
      <div className="botones no-imprimir" style={{ marginTop: 0, marginBottom: 14 }}>
        <button className="btn" onClick={() => window.print()}>Imprimir</button>
        <button className="btn secundario" onClick={volver}>Volver</button>
      </div>
      <section className="card hoja">
        <h2 className="hoja-titulo">Formulario de rendición de cuentas de subvención de proyectos</h2>
        <p className="hoja-dato">
          Institución: Club Deportivo Hugo Jara · Proyecto: {FONDO.proyecto} · Monto decreto: {pesos(FONDO.municipio)} · {rendicion.nombre}
        </p>
        <div className="tabla-scroll">
          <table className="hoja-tabla">
            <thead>
              <tr><th>Ítem</th><th>N° boleta/factura</th><th>Fecha emisión</th><th>Proveedor</th><th>Concepto</th><th>Monto</th></tr>
            </thead>
            <tbody>
              {compras.map((c) => (
                <tr key={c.id}>
                  <td>{nombreItem(c.item)}</td><td>{c.documento || '—'}</td><td>{fechaPlanilla(c.fecha)}</td>
                  <td>{c.proveedor || '—'}</td><td>{c.que}</td><td className="num">{pesos(c.monto)}</td>
                </tr>
              ))}
              {compras.length === 0 && <tr><td colSpan={6}>Todavía no hay compras listas para rendir.</td></tr>}
            </tbody>
            <tfoot>
              <tr><td colSpan={5}>Total rendido en este período</td><td className="num">{pesos(total)}</td></tr>
            </tfoot>
          </table>
        </div>
        <div className="firmas">
          <div><span className="linea" />Firma tesorero</div>
          <div><span className="linea" />Firma representante legal</div>
          <div><span className="timbre">Timbre del club</span></div>
        </div>
        <p className="hoja-nota">
          Lleva los mismos datos que el Anexo N°1 para traspasarlos o adjuntarla. No reemplaza el formulario oficial de la Municipalidad.
        </p>
      </section>
      {!rendicion.presentada && (
        <button className="btn secundario no-imprimir" onClick={() => { f.presentar(rendicion.id, compras.map((c) => c.id)); volver(); }}
                disabled={compras.length === 0}>
          Marcar como presentada
        </button>
      )}
    </>
  );
}

function Rendiciones({ f, verHoja }) {
  const abierta = f.rendiciones.find((r) => !r.presentada);
  const pendientes = f.compras.filter((c) => c.estado === 'pendiente' && c.pago).length;
  return (
    <>
      <p className="subtitulo">Cada dos meses; la última antes del 30 de diciembre. Si la Municipalidad observa algo, hay 10 días hábiles para corregirlo (arts. 24–25).</p>
      {f.rendiciones.map((r) => {
        const estado = r.presentada ? 'Presentada' : r === abierta ? 'Borrador' : 'Sin iniciar';
        const compras = r.presentada ? f.compras.filter((c) => r.compras.includes(c.id)) : r === abierta ? f.paraRendir : [];
        return (
          <section key={r.id} className="card">
            <div className="item-cabeza">
              <div className="item-que">{r.nombre}</div>
              <span className={`ef ${r.presentada ? 'rendida' : r === abierta ? 'pendiente' : 'sin_gastos'}`}>{estado}</span>
            </div>
            <div className="item-meta">{r.plazo}</div>
            {r === abierta && (
              <p className="item-meta">
                {plural(compras.length, 'compra lista', 'compras listas')} por {pesos(compras.reduce((t, c) => t + c.monto, 0))}
                {pendientes > 0 && ` · ${plural(pendientes, 'pagada con respaldos pendientes', 'pagadas con respaldos pendientes')}`}
              </p>
            )}
            {r.presentada && <p className="item-meta">{plural(compras.length, 'compra rendida', 'compras rendidas')}</p>}
            {(r === abierta || r.presentada) && (
              <button className="btn chico" style={{ marginTop: 12 }} onClick={() => verHoja(r.id)}>Ver hoja para firmar</button>
            )}
            {r.presentada && (
              <label className="casilla">
                <input type="checkbox" checked={r.subida} onChange={(e) => f.marcarSubida(r.id, e.target.checked)} />
                Subida a subvenciones.lascondes.cl (art. 17)
              </label>
            )}
          </section>
        );
      })}

      <h2 className="seccion">Al cierre: por reintegrar</h2>
      <section className="card">
        <p className="item-meta" style={{ marginTop: 0 }}>Lo que no se gaste de un ítem se devuelve a la Municipalidad; no se puede pasar a otro ítem (art. 6).</p>
        <ul className="movimientos">
          {f.porItem.filter((i) => i.aprobado > 0).map((i) => (
            <li key={i.id}><span>{i.nombre}</span><span className="mov-monto">{pesos(i.disponible)}</span></li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default function Fondo() {
  const f = useFondo();
  const [vista, setVista] = useState('panel');
  const [abierta, setAbierta] = useState(null);
  const [agregando, setAgregando] = useState(false);
  const [hoja, setHoja] = useState(null);

  const ir = (v) => { setVista(v); setAgregando(false); setHoja(null); setAbierta(null); window.scrollTo(0, 0); };
  const lista = (filtro) => (
    <ul className="items card">
      {f.compras.filter(filtro).map((c) => (
        <Compra key={c.id} c={c} f={f} abierta={abierta === c.id} alternar={() => setAbierta(abierta === c.id ? null : c.id)} />
      ))}
    </ul>
  );
  const rendicionHoja = f.rendiciones.find((r) => r.id === hoja);

  return (
    <div className="pagina suelta fondo">
      <header className="barra no-imprimir">
        <img src={ESCUDO} alt="Escudo del Club Hugo Jara" />
        <div className="barra-texto">
          <div className="barra-nombre display">Fondo Las Condes</div>
          <div className="barra-sub">{FONDO.proyecto} · Club Deportivo Hugo Jara</div>
        </div>
      </header>
      <p className="aviso-demo no-imprimir">
        Vista previa con datos de ejemplo: puedes tocar todo, pero nada se guarda. Al recargar la página vuelve al ejemplo.
      </p>

      <div className="filtros no-imprimir" role="tablist">
        {VISTAS.map((v) => (
          <button key={v.id} role="tab" aria-selected={vista === v.id} className={`filtro ${vista === v.id ? 'activo' : ''}`} onClick={() => ir(v.id)}>
            {v.nombre}
          </button>
        ))}
      </div>

      {vista === 'panel' && <Panel f={f} />}

      {vista === 'compras' && (agregando ? <Agregar f={f} listo={() => setAgregando(false)} /> : (
        <>
          <button className="btn" style={{ marginBottom: 14 }} onClick={() => setAgregando(true)}>Agregar compra</button>
          {lista((c) => c.item !== 'personal')}
          <p className="nota">Toca una compra para ver sus respaldos. Una compra queda «Lista para rendir» solo con todos los respaldos y pagada con la cuenta del club.</p>
        </>
      ))}

      {vista === 'honorarios' && (
        <>
          <p className="subtitulo">Entrenador: 3 cuotas de {pesos(212500)}, de octubre a diciembre. Cada mes pide su boleta de honorarios, la transferencia y el F29 (arts. 18–20).</p>
          {lista((c) => c.item === 'personal')}
        </>
      )}

      {vista === 'rendiciones' && (rendicionHoja
        ? <Hoja f={f} rendicion={rendicionHoja}
                compras={rendicionHoja.presentada ? f.compras.filter((c) => rendicionHoja.compras.includes(c.id)) : f.paraRendir}
                volver={() => setHoja(null)} />
        : <Rendiciones f={f} verHoja={setHoja} />)}

      {vista === 'dudas' && (
        <>
          <p className="subtitulo">Lo que falta confirmar antes de programar el módulo de verdad.</p>
          <ol className="card dudas">
            {DUDAS.map((d) => (
              <li key={d.tema}><span className="marca">{d.tema}</span> {d.texto}</li>
            ))}
          </ol>
        </>
      )}

      <p className="nota no-imprimir">
        <button className="enlace" onClick={() => { f.reiniciar(); ir('panel'); }}>Volver al ejemplo inicial</button>
      </p>
    </div>
  );
}
