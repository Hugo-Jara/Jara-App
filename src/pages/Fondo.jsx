import { useState } from 'react';
import { useFondo, enlaceFondo, FONDO, PAGOS, ESTADOS, respaldosDe, motivoNoRendible } from '../lib/fondo.js';
import { pesos } from '../lib/pedido.js';
import { fechaCorta, hoyIso } from '../lib/fechas.js';
import { plural } from '../lib/texto.js';

// Fondo Las Condes 2026 (Compras 2). Lo ven el equipo del fondo, Hacienda y
// los administradores; la base rechaza a cualquier otra cuenta. Las compras se
// piden por Compras, en el tópico "Fondo", y acá se pasan al fondo con su ítem.

const VISTAS = [
  { id: 'panel', nombre: 'Panel' },
  { id: 'compras', nombre: 'Compras' },
  { id: 'honorarios', nombre: 'Honorarios' },
  { id: 'rendiciones', nombre: 'Rendiciones' },
];
const SITUACION = { sin_gastos: 'Sin gastos', al_dia: 'Al día', faltan: 'Faltan respaldos', excedido: 'Excedido' };
const fechaPlanilla = (iso) => (iso ? iso.split('-').reverse().join('-') : '');
const porcentaje = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
const soloNumero = (v) => Number(String(v).replace(/\D/g, '')) || 0;

// Corre una acción y guarda su error para mostrarlo donde se tocó.
function useAccion() {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const correr = async (f) => {
    setOcupado(true); setError('');
    try { await f(); return true; } catch (e) { setError(e.message); return false; } finally { setOcupado(false); }
  };
  return { ocupado, error, correr };
}

async function abrir(a) {
  if (a.url) { window.open(a.url, '_blank', 'noopener'); return; }
  window.open(await enlaceFondo(a.ruta), '_blank', 'noopener');
}

function Panel({ f }) {
  const accion = useAccion();
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
        <Checklist filas={f.documentos.map((d) => ({ ...d, marcado: d.listo, archivo: d.ruta ? { ruta: d.ruta, nombre: d.archivo } : null }))}
                   marcar={(id, v, file) => accion.correr(() => f.marcarDocumento(id, v, file))} ocupado={accion.ocupado} />
        {accion.error && <p className="error">{accion.error}</p>}
      </section>

      <p className="nota">
        Ven el fondo el equipo del fondo, Hacienda y los administradores, cada uno con su cuenta. Los archivos quedan en un lugar privado.
      </p>
    </>
  );
}

// Lista de respaldos. Cada fila se marca sola o subiendo su archivo, salvo las
// que vienen de Compras (fija) y las que se guardan solo en papel (sin archivo).
function Checklist({ filas, marcar, ocupado, bloqueado }) {
  return (
    <ul className="checklist">
      {filas.map((r) => (
        <li key={r.id}>
          <label className="casilla">
            <input type="checkbox" checked={!!r.marcado} disabled={ocupado || bloqueado || r.fija}
                   onChange={(e) => marcar(r.id, e.target.checked)} />
            <span>
              <span className="checklist-nombre">{r.nombre}</span>
              {r.nota && <span className="checklist-nota">{r.fija ? 'Ya está en Compras' : r.nota}</span>}
            </span>
          </label>
          {r.archivo && (
            <button type="button" className="enlace" onClick={() => abrir(r.archivo)}>Ver {r.archivo.nombre}</button>
          )}
          {!r.fija && !r.enPapel && !bloqueado && !r.archivo && (
            <label className="enlace">
              Subir archivo
              <input type="file" accept="image/*,application/pdf" hidden disabled={ocupado}
                     onChange={(e) => e.target.files[0] && marcar(r.id, true, e.target.files[0])} />
            </label>
          )}
        </li>
      ))}
    </ul>
  );
}

function Datos({ c, f, items, listo }) {
  const [d, setD] = useState({ item: c.item, que: c.que, monto: c.monto, proveedor: c.proveedor, documento: c.documento,
                               fecha: c.fecha ?? '', pago: c.pago ?? '', entrega: c.entrega });
  const accion = useAccion();
  const campo = (k) => (e) => setD({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const guardar = async (e) => {
    e.preventDefault();
    if (await accion.correr(() => f.guardar(c.id, { ...d, monto: soloNumero(d.monto) }))) listo();
  };
  const id = (k) => `${k}-${c.id}`;
  return (
    <form onSubmit={guardar}>
      {c.item !== 'personal' && (
        <>
          <label htmlFor={id('item')}>Ítem del presupuesto</label>
          <select id={id('item')} value={d.item} onChange={campo('item')}>
            {items.filter((i) => i.id !== 'personal').map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
          <label htmlFor={id('que')}>¿Qué se compró?</label>
          <input id={id('que')} required maxLength={200} value={d.que} onChange={campo('que')} />
        </>
      )}
      <label htmlFor={id('monto')}>Monto con IVA</label>
      <input id={id('monto')} required inputMode="numeric" value={d.monto ? pesos(soloNumero(d.monto)) : ''} onChange={campo('monto')} />
      <label htmlFor={id('prov')}>Proveedor</label>
      <input id={id('prov')} maxLength={120} value={d.proveedor} onChange={campo('proveedor')} />
      <label htmlFor={id('doc')}>N° de boleta o factura</label>
      <input id={id('doc')} maxLength={40} value={d.documento} onChange={campo('documento')} />
      <label htmlFor={id('fecha')}>Fecha de emisión</label>
      <input id={id('fecha')} type="date" value={d.fecha} onChange={campo('fecha')} />
      <label htmlFor={id('pago')}>¿Cómo se pagó?</label>
      <select id={id('pago')} value={d.pago} onChange={campo('pago')}>
        <option value="">Todavía no se paga</option>
        {Object.entries(PAGOS).map(([k, texto]) => <option key={k} value={k}>{texto}</option>)}
      </select>
      {c.item !== 'personal' && (
        <label className="casilla">
          <input type="checkbox" checked={d.entrega} onChange={campo('entrega')} />
          Se entrega a los participantes (pide nómina firmada, art. 10)
        </label>
      )}
      {accion.error && <p className="error">{accion.error}</p>}
      <div className="botones">
        <button className="btn" disabled={accion.ocupado}>{accion.ocupado ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn secundario" onClick={listo}>Cancelar</button>
      </div>
    </form>
  );
}

function Compra({ c, f, items, abierta, alternar }) {
  const [editando, setEditando] = useState(false);
  const accion = useAccion();
  const motivo = motivoNoRendible(c);
  const respaldos = respaldosDe(c);
  const listos = respaldos.filter((r) => c.respaldos[r.id]).length;
  const rendida = c.estado === 'rendida';
  const nombreItem = items.find((i) => i.id === c.item)?.nombre ?? '—';
  const quitar = () => window.confirm('¿Sacar este gasto del fondo? La compra queda en Compras, sin ítem.')
    && accion.correr(() => f.quitar(c.id));
  return (
    <li className="item">
      <button type="button" className="item-boton" onClick={alternar} aria-expanded={abierta}>
        <div className="item-cabeza">
          <div className="item-que">{c.que}</div>
          <div className="item-monto">{pesos(c.monto)}</div>
        </div>
        <div className="item-meta">
          {c.item !== 'personal' && <>{nombreItem} · </>}
          <span className={`ef ${c.estado}`}>{ESTADOS[c.estado]}</span>
          {c.estado !== 'no_rendible' && <> · {listos} de {respaldos.length} respaldos</>}
        </div>
      </button>

      {abierta && (
        <div className="compra-detalle">
          {motivo && <p className="item-comentario">{motivo} Lo paga el club.</p>}
          {editando ? <Datos c={c} f={f} items={items} listo={() => setEditando(false)} /> : (
            <>
              <dl className="datos">
                <div><dt>Proveedor</dt><dd>{c.proveedor || '—'}</dd></div>
                <div><dt>Boleta o factura</dt><dd>{c.documento ? `N° ${c.documento}` : 'Pendiente'}</dd></div>
                <div><dt>Fecha de emisión</dt><dd>{c.fecha ? fechaCorta(c.fecha) : '—'}</dd></div>
                <div><dt>Pago</dt><dd>{c.pago ? PAGOS[c.pago] : 'Todavía no se paga'}</dd></div>
                {c.compra && <div><dt>Pedida por</dt><dd>{c.compra.quien}</dd></div>}
              </dl>
              {!rendida && (
                <div className="botones">
                  <button type="button" className="btn chico" onClick={() => setEditando(true)}>Completar datos</button>
                  {c.item !== 'personal' && (
                    <button type="button" className="btn chico secundario" disabled={accion.ocupado} onClick={quitar}>Sacar del fondo</button>
                  )}
                </div>
              )}
            </>
          )}
          <h3 className="grupo-titulo pendiente" style={{ marginTop: 18 }}>Respaldos</h3>
          <Checklist bloqueado={rendida} ocupado={accion.ocupado}
                     filas={respaldos.map((r) => ({
                       ...r, marcado: !!c.respaldos[r.id], fija: c.enCompras.includes(r.id),
                       archivo: typeof c.respaldos[r.id] === 'object' ? c.respaldos[r.id] : null,
                     }))}
                     marcar={(id, v, file) => accion.correr(() => f.marcarRespaldo(c.id, id, v, file))} />
          {accion.error && <p className="error">{accion.error}</p>}
          {c.estado === 'lista' && <p className="respuesta">Lista para rendir: todos los respaldos y pagada con la cuenta del club.</p>}
          {rendida && <p className="respuesta">Ya está en la {f.rendiciones.find((r) => r.id === c.rendicion)?.nombre ?? 'rendición'}: no se cambia.</p>}
        </div>
      )}
    </li>
  );
}

// Compras pedidas en el tópico Fondo que todavía no tienen ítem.
function PorClasificar({ f, items }) {
  const [elegido, setElegido] = useState({});
  const accion = useAccion();
  if (!f.porClasificar.length) return null;
  const opciones = items.filter((i) => i.id !== 'personal');
  return (
    <>
      <h2 className="seccion">Por pasar al fondo</h2>
      <section className="card">
        <p className="item-meta" style={{ marginTop: 0 }}>Pedidas en Compras, en el tópico Fondo. Elige su ítem para cargarlas al fondo.</p>
        <ul className="movimientos">
          {f.porClasificar.map((p) => {
            const e = elegido[p.id] ?? { item: opciones[0]?.id, entrega: false };
            const set = (x) => setElegido({ ...elegido, [p.id]: { ...e, ...x } });
            return (
              <li key={p.id} style={{ display: 'block' }}>
                <div className="item-cabeza"><span>{p.que} · {p.quien}</span><span className="mov-monto">{pesos(p.monto)}</span></div>
                <select aria-label="Ítem del presupuesto" value={e.item} onChange={(x) => set({ item: x.target.value })}>
                  {opciones.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                </select>
                <label className="casilla">
                  <input type="checkbox" checked={e.entrega} onChange={(x) => set({ entrega: x.target.checked })} />
                  Se entrega a los participantes
                </label>
                <button type="button" className="btn chico" disabled={accion.ocupado}
                        onClick={() => accion.correr(() => f.clasificar(p.id, e.item, e.entrega))}>
                  Pasar al fondo
                </button>
              </li>
            );
          })}
        </ul>
        {accion.error && <p className="error">{accion.error}</p>}
      </section>
    </>
  );
}

function Agregar({ f, listo }) {
  const [item, setItem] = useState('bienes');
  const [que, setQue] = useState('');
  const [monto, setMonto] = useState('');
  const [pago, setPago] = useState('');
  const [entrega, setEntrega] = useState(false);
  const accion = useAccion();

  const n = soloNumero(monto);
  const it = f.porItem.find((i) => i.id === item);
  const pasa = it ? Math.max(0, n - it.disponible) : 0;
  const guardar = async (e) => {
    e.preventDefault();
    const ok = await accion.correr(() => f.agregar({ item, que: que.trim(), monto: n, proveedor: '', documento: '', fecha: hoyIso(), pago: pago || null, entrega }));
    if (ok) listo();
  };

  return (
    <form className="card" onSubmit={guardar}>
      <div className="sobretitulo">Cargar un gasto directo</div>
      <p className="item-meta">Lo normal es pedir la compra en Compras, tópico Fondo. Usa esto para algo que ya se pagó sin pasar por Compras.</p>
      <label htmlFor="f-item">Ítem del presupuesto</label>
      <select id="f-item" value={item} onChange={(e) => setItem(e.target.value)}>
        {f.items.filter((i) => i.id !== 'personal').map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
        <option value="fuera">No está en el presupuesto</option>
      </select>
      <p className="item-meta">Los honorarios del entrenador van en su pestaña. No se rinden multas, intereses ni impuestos (art. 11).</p>

      {item === 'fuera' ? (
        <>
          <p className="item-comentario">
            No está en el presupuesto aprobado, así que no se puede cargar al fondo. Si igual hay que comprarlo, va por Compras y lo paga el club.
          </p>
          <button type="button" className="btn secundario" style={{ marginTop: 14 }} onClick={listo}>Entendido</button>
        </>
      ) : (
        <>
          <label htmlFor="f-que">¿Qué se compró?</label>
          <input id="f-que" required minLength={3} maxLength={200} value={que} onChange={(e) => setQue(e.target.value)} placeholder="Por ejemplo: balones (22)" />
          <label htmlFor="f-monto">Monto con IVA</label>
          <input id="f-monto" required inputMode="numeric" value={monto ? pesos(n) : ''}
                 onChange={(e) => setMonto(e.target.value.replace(/\D/g, ''))} placeholder="$0" />
          <p className="item-meta">Con IVA, porque es lo que dirá la boleta. Disponible en este ítem: <strong>{pesos(it?.disponible ?? 0)}</strong></p>
          {pasa > 0 && <p className="item-comentario">Pasa lo disponible por {pesos(pasa)}. Esa parte no se rinde: la pone el club.</p>}
          <label htmlFor="f-pago">¿Cómo se pagó?</label>
          <select id="f-pago" value={pago} onChange={(e) => setPago(e.target.value)}>
            <option value="">Todavía no se sabe</option>
            {Object.entries(PAGOS).map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
          </select>
          {pago === 'particular' && <p className="item-comentario">Así no se puede rendir (art. 9): solo pagos con la cuenta o el débito del club.</p>}
          <label className="casilla">
            <input type="checkbox" checked={entrega} onChange={(e) => setEntrega(e.target.checked)} />
            Se entrega a los participantes (pide nómina firmada, art. 10)
          </label>
          {accion.error && <p className="error">{accion.error}</p>}
          <div className="botones">
            <button className="btn" disabled={accion.ocupado}>Agregar al fondo</button>
            <button type="button" className="btn secundario" onClick={listo}>Cancelar</button>
          </div>
        </>
      )}
    </form>
  );
}

function Hoja({ f, rendicion, compras, volver }) {
  const accion = useAccion();
  const total = compras.reduce((t, c) => t + c.monto, 0);
  const nombreItem = (id) => f.items.find((i) => i.id === id)?.nombre ?? '—';
  const presentar = async () => {
    if (!window.confirm(`¿Presentar la ${rendicion.nombre}? Entran ${plural(compras.length, 'gasto', 'gastos')} y ya no se pueden cambiar.`)) return;
    if (await accion.correr(() => f.presentar(rendicion.id))) volver();
  };
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
              {compras.length === 0 && <tr><td colSpan={6}>Todavía no hay gastos listos para rendir.</td></tr>}
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
        <button className="btn secundario no-imprimir" onClick={presentar} disabled={compras.length === 0 || accion.ocupado}>
          Marcar como presentada
        </button>
      )}
      {accion.error && <p className="error no-imprimir">{accion.error}</p>}
    </>
  );
}

function Rendiciones({ f, verHoja }) {
  const accion = useAccion();
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
                {plural(compras.length, 'gasto listo', 'gastos listos')} por {pesos(compras.reduce((t, c) => t + c.monto, 0))}
                {pendientes > 0 && ` · ${plural(pendientes, 'pagado con respaldos pendientes', 'pagados con respaldos pendientes')}`}
              </p>
            )}
            {r.presentada && <p className="item-meta">{plural(compras.length, 'gasto rendido', 'gastos rendidos')}</p>}
            {(r === abierta || r.presentada) && (
              <button className="btn chico" style={{ marginTop: 12 }} onClick={() => verHoja(r.id)}>Ver hoja para firmar</button>
            )}
            {r.presentada && (
              <label className="casilla">
                <input type="checkbox" checked={r.subida} disabled={accion.ocupado}
                       onChange={(e) => accion.correr(() => f.marcarSubida(r.id, e.target.checked))} />
                Subida a subvenciones.lascondes.cl (art. 17)
              </label>
            )}
          </section>
        );
      })}
      {accion.error && <p className="error">{accion.error}</p>}

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

  if (f.cargando) return <div className="cargando">Cargando…</div>;
  if (f.error && !f.items) {
    return (
      <div className="fondo">
        <h1 className="titulo display">Fondo Las Condes</h1>
        <p className="subtitulo">{f.error}</p>
      </div>
    );
  }

  const ir = (v) => { setVista(v); setAgregando(false); setHoja(null); setAbierta(null); window.scrollTo(0, 0); };
  const lista = (filtro) => (
    <ul className="items card">
      {f.compras.filter(filtro).map((c) => (
        <Compra key={c.id} c={c} f={f} items={f.items} abierta={abierta === c.id} alternar={() => setAbierta(abierta === c.id ? null : c.id)} />
      ))}
    </ul>
  );
  const rendicionHoja = f.rendiciones.find((r) => r.id === hoja);

  return (
    <div className="fondo">
      <h1 className="titulo display no-imprimir">Fondo Las Condes</h1>
      <p className="subtitulo no-imprimir">{FONDO.proyecto}</p>
      {f.esEjemplo && (
        <p className="aviso-demo no-imprimir">
          Datos de ejemplo: puedes tocar todo, pero nada se guarda. Al recargar la página vuelve al ejemplo.
        </p>
      )}

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
          <PorClasificar f={f} items={f.items} />
          <h2 className="seccion">En el fondo</h2>
          {lista((c) => c.item !== 'personal')}
          <button className="btn secundario" style={{ marginTop: 14 }} onClick={() => setAgregando(true)}>Cargar un gasto directo</button>
          <p className="nota">Toca un gasto para completar sus datos y respaldos. Queda «Lista para rendir» solo con todos los respaldos y pagado con la cuenta del club.</p>
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

      {f.reiniciar && (
        <p className="nota no-imprimir">
          <button className="enlace" onClick={() => { f.reiniciar(); ir('panel'); }}>Volver al ejemplo inicial</button>
        </p>
      )}
    </div>
  );
}
