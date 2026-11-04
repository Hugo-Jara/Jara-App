import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  usePlantelesTesoreria, useTesoreria, armarPlan, enlaceWhatsApp, enlaceCorreoMasivo,
  TEMPORADA, TIPOS, MEDIOS, CATEGORIAS, ESTADO_CARGO,
} from '../lib/tesoreria.js';
import { pesos } from '../lib/pedido.js';
import { hoyIso } from '../lib/fechas.js';
import { plural } from '../lib/texto.js';

// Tesorería de cada plantel (Fase 5). El tesorero ve y edita solo su plantel;
// Hacienda y los administradores, todos. La base rechaza a cualquier otra cuenta.

const VISTAS = [
  { id: 'jugadores', nombre: 'Jugadores' },
  { id: 'cobrar', nombre: 'Cobrar' },
  { id: 'cuotas', nombre: 'Cuotas' },
  { id: 'caja', nombre: 'Caja' },
];
const soloNumero = (v) => Number(String(v).replace(/\D/g, '')) || 0;
const fechaCl = (iso) => (iso ? iso.split('-').reverse().join('-') : '');
const campoPesos = (n) => (n ? pesos(n) : '');

function useAccion() {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState('');
  const correr = async (f, mensaje = '') => {
    setOcupado(true); setError(''); setListo('');
    try { await f(); setListo(mensaje); return true; } catch (e) { setError(e.message); return false; } finally { setOcupado(false); }
  };
  return { ocupado, error, listo, correr };
}

const Avisos = ({ a }) => (<>{a.error && <p className="error">{a.error}</p>}{a.listo && <p className="exito">{a.listo}</p>}</>);

export default function Tesoreria() {
  const planteles = usePlantelesTesoreria();
  const [elegido, setElegido] = useState(null);
  if (planteles === null) return <div className="cargando">Cargando…</div>;
  if (planteles.length === 0) return <Navigate to="/mas" replace />;
  const actual = planteles.find((p) => p.id === elegido) ?? planteles[0];
  return (
    <>
      <h1 className="titulo display">Tesorería</h1>
      <p className="subtitulo">{actual.nombre} · temporada {TEMPORADA}{actual.editar ? '' : ' · solo mirar'}</p>
      {planteles.length > 1 && (
        <div className="filtros" role="tablist" aria-label="Planteles">
          {planteles.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={p.id === actual.id}
                    className={`filtro${p.id === actual.id ? ' activo' : ''}`} onClick={() => setElegido(p.id)}>{p.nombre}</button>
          ))}
        </div>
      )}
      <Plantel key={actual.id} equipo={actual.id} nombre={actual.nombre} />
    </>
  );
}

function Plantel({ equipo, nombre }) {
  const t = useTesoreria(equipo);
  const [vista, setVista] = useState('jugadores');
  const [abierto, setAbierto] = useState(null);
  if (t.cargando) return <div className="cargando">Cargando…</div>;
  if (t.error) return <p className="error">{t.error}</p>;
  const p = t.plantel;
  const editar = !!p.editar;
  const ficha = abierto && p.jugadores.find((j) => j.id === abierto);

  if (ficha) {
    return <Ficha j={ficha} plantel={nombre} editar={editar} acciones={t.acciones} volver={() => setAbierto(null)} />;
  }

  return (
    <>
      <section className="card total">
        <div className="sobretitulo">Caja del plantel</div>
        <div className="total-monto display">{pesos(p.saldo)}</div>
        <dl className="total-detalle">
          <div><dt>Recaudado</dt><dd>{pesos(p.recaudado)}</dd></div>
          <div><dt>Deuda vencida</dt><dd>{pesos(p.deudaVencida)}</dd></div>
          <div><dt>Al día</dt><dd>{p.alDia} de {p.activos}</dd></div>
        </dl>
      </section>
      {!editar && (
        <p className="aviso-demo tes-solo-mirar">Estás en modo solo mirar: puedes ver todo, pero no cambiar cuotas, condiciones ni pagos. Las cuentas de prueba siempre entran así; para editar, entra con tu cuenta normal.</p>
      )}
      {p.cuotas.length === 0 && (
        <p className="item-comentario">Todavía no hay cuotas para esta temporada. {editar ? 'Parte por la pestaña Cuotas.' : ''}</p>
      )}
      <div className="filtros" role="tablist" aria-label="Secciones">
        {VISTAS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={vista === v.id}
                  className={`filtro${vista === v.id ? ' activo' : ''}`} onClick={() => setVista(v.id)}>{v.nombre}</button>
        ))}
      </div>
      {vista === 'jugadores' && <Jugadores p={p} editar={editar} acciones={t.acciones} abrir={setAbierto} />}
      {vista === 'cobrar' && <Cobrar p={p} nombre={nombre} abrir={setAbierto} />}
      {vista === 'cuotas' && <Cuotas p={p} editar={editar} acciones={t.acciones} />}
      {vista === 'caja' && <Caja p={p} editar={editar} acciones={t.acciones} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Jugadores
// ---------------------------------------------------------------------------
function EstadoJugador({ j }) {
  if (!j.activo) return <span className="ef sin_gastos">No juega</span>;
  if (j.deudaVencida > 0) return <span className="ef excedido">Debe {pesos(j.deudaVencida)}</span>;
  if (j.total === 0) return <span className="ef sin_gastos">{j.tipo === 'exento' ? 'Exento' : 'Sin cargos'}</span>;
  return <span className="ef al_dia">Al día</span>;
}

function Jugadores({ p, editar, acciones, abrir }) {
  const [buscar, setBuscar] = useState('');
  const lista = p.jugadores.filter((j) => j.nombre.toLowerCase().includes(buscar.trim().toLowerCase()));
  return (
    <>
      <input type="search" placeholder="Buscar jugador" aria-label="Buscar jugador" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      <div className="card lista" style={{ marginTop: 12 }}>
        {lista.length === 0 && <p className="item-meta">No hay jugadores.</p>}
        {lista.map((j) => (
          <button key={j.id} type="button" className="fila tes-fila" onClick={() => abrir(j.id)}>
            <span className="mov-texto">
              <span className="tes-nombre">{j.nombre}{j.apodo && <span className="apodo"> · {j.apodo}</span>}</span>
              <span className="item-meta" style={{ marginTop: 0 }}>
                {TIPOS[j.tipo]}{j.tipo === 'beca' || (j.tipo === 'normal' && Number(j.descuento_pct) > 0) ? ` ${Number(j.descuento_pct)}%` : ''}
                {' · '}pagado {pesos(j.pagado)}{!j.telefono && !j.correo ? ' · sin contacto' : ''}
              </span>
            </span>
            <EstadoJugador j={j} />
          </button>
        ))}
      </div>
      {editar && <SumarJugador acciones={acciones} />}
      {editar && <CargoExtra p={p} acciones={acciones} />}
    </>
  );
}

function SumarJugador({ acciones }) {
  const [texto, setTexto] = useState('');
  const [res, setRes] = useState(null);
  const a = useAccion();
  const buscar = (e) => { e.preventDefault(); a.correr(async () => setRes(await acciones.buscarPersonas(texto))); };
  return (
    <>
      <h2 className="seccion">Sumar a alguien de la nómina</h2>
      <form className="card" onSubmit={buscar}>
        <p className="item-meta" style={{ marginTop: 0 }}>Para quien juega en el plantel pero no aparece en la lista. Si no está en la nómina del club, pídeselo al administrador.</p>
        <div className="botones" style={{ marginTop: 10 }}>
          <input aria-label="Nombre" placeholder="Nombre o apellido" minLength={2} required value={texto} onChange={(e) => setTexto(e.target.value)} />
          <button className="btn chico secundario" disabled={a.ocupado}>Buscar</button>
        </div>
        {res && res.length === 0 && <p className="item-meta">No encontramos a nadie con ese nombre.</p>}
        {res && res.length > 0 && (
          <ul className="movimientos">
            {res.map((r) => (
              <li key={r.id}>
                <span>{r.nombre}</span>
                <button type="button" className="btn chico" disabled={a.ocupado}
                        onClick={() => a.correr(async () => { await acciones.guardarJugador(r.id, {}); setRes(null); setTexto(''); }, 'Listo, quedó en la tesorería del plantel.')}>Sumar</button>
              </li>
            ))}
          </ul>
        )}
        <Avisos a={a} />
      </form>
    </>
  );
}

function CargoExtra({ p, acciones }) {
  const activos = p.jugadores.filter((j) => j.activo);
  const [d, setD] = useState({ concepto: '', monto: 0, vence: hoyIso(), elegidos: [] });
  const a = useAccion();
  const todos = d.elegidos.length === activos.length;
  const guardar = (e) => {
    e.preventDefault();
    a.correr(async () => {
      await acciones.cargarExtra(d.elegidos, d.concepto.trim(), d.monto, d.vence);
      setD({ concepto: '', monto: 0, vence: hoyIso(), elegidos: [] });
    }, 'Cargo agregado.');
  };
  return (
    <>
      <h2 className="seccion">Cargo extra (polera, asado, rifa…)</h2>
      <form className="card" onSubmit={guardar}>
        <label htmlFor="x-concepto">¿Qué se cobra?</label>
        <input id="x-concepto" required maxLength={80} value={d.concepto} onChange={(e) => setD({ ...d, concepto: e.target.value })} />
        <label htmlFor="x-monto">Monto por persona</label>
        <input id="x-monto" required inputMode="numeric" value={campoPesos(d.monto)} onChange={(e) => setD({ ...d, monto: soloNumero(e.target.value) })} />
        <label htmlFor="x-vence">Vence</label>
        <input id="x-vence" type="date" required value={d.vence} onChange={(e) => setD({ ...d, vence: e.target.value })} />
        <label className="casilla">
          <input type="checkbox" checked={todos} onChange={() => setD({ ...d, elegidos: todos ? [] : activos.map((j) => j.id) })} />
          <span>Todo el plantel ({activos.length})</span>
        </label>
        <div className="tes-elegir">
          {activos.map((j) => (
            <label key={j.id} className="casilla tenue">
              <input type="checkbox" checked={d.elegidos.includes(j.id)}
                     onChange={(e) => setD({ ...d, elegidos: e.target.checked ? [...d.elegidos, j.id] : d.elegidos.filter((x) => x !== j.id) })} />
              <span>{j.nombre}</span>
            </label>
          ))}
        </div>
        <button className="btn" style={{ marginTop: 16 }} disabled={a.ocupado || !d.monto || d.elegidos.length === 0}>
          Cobrar a {plural(d.elegidos.length, 'jugador', 'jugadores')}
        </button>
        <Avisos a={a} />
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ficha de un jugador
// ---------------------------------------------------------------------------
function Ficha({ j, plantel, editar, acciones, volver }) {
  const wa = enlaceWhatsApp(j, plantel);
  return (
    <>
      <button type="button" className="enlace" onClick={volver}>← Volver al plantel</button>
      <h2 className="titulo display" style={{ marginTop: 12 }}>{j.nombre}</h2>
      <section className="card total">
        <div className="sobretitulo">{j.deudaVencida > 0 ? 'Deuda vencida' : 'Al día'}</div>
        <div className="total-monto display">{pesos(j.deudaVencida)}</div>
        <dl className="total-detalle">
          <div><dt>Temporada</dt><dd>{pesos(j.total)}</dd></div>
          <div><dt>Pagado</dt><dd>{pesos(j.pagado)}</dd></div>
          <div><dt>{j.aFavor ? 'A favor' : 'Falta'}</dt><dd>{pesos(j.aFavor || j.porPagar)}</dd></div>
        </dl>
        {(wa || j.correo) && (
          <div className="botones chicos">
            {wa && <a className="btn chico secundario" href={wa} target="_blank" rel="noopener noreferrer">Cobrar por WhatsApp</a>}
            {j.correo && <a className="btn chico secundario" href={enlaceCorreoMasivo([j], plantel)}>Cobrar por correo</a>}
          </div>
        )}
      </section>

      {editar && <RegistrarPago j={j} acciones={acciones} />}

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
                  {c.estado === 'parcial' || (c.estado === 'vencido' && c.pagado > 0) ? ` (${pesos(c.pagado)})` : ''}
                </span>
              </span>
              <span className="mov-monto">{pesos(c.monto)}</span>
              {editar && c.extra && <QuitarExtra id={c.extra} acciones={acciones} />}
            </li>
          ))}
        </ul>
      </section>

      <h2 className="seccion">Pagos</h2>
      <section className="card">
        {j.pagos.length === 0 && <p className="item-meta" style={{ marginTop: 0 }}>Todavía no hay pagos registrados.</p>}
        <ul className="movimientos">
          {j.pagos.map((g) => <Pago key={g.id} g={g} editar={editar} acciones={acciones} />)}
        </ul>
      </section>

      <Condicion j={j} editar={editar} acciones={acciones} />
    </>
  );
}

function QuitarExtra({ id, acciones }) {
  const a = useAccion();
  return (
    <button type="button" className="enlace quitar" disabled={a.ocupado}
            onClick={() => window.confirm('¿Quitar este cargo?') && a.correr(() => acciones.quitarExtra(id))}>Quitar</button>
  );
}

function Pago({ g, editar, acciones }) {
  const a = useAccion();
  return (
    <li style={g.anulado ? { opacity: 0.5 } : undefined}>
      <span className="mov-texto">
        <span>{fechaCl(g.fecha)} · {MEDIOS[g.medio] ?? g.medio}{g.anulado ? ' · anulado' : ''}</span>
        {(g.nota || g.registro) && <span className="item-meta" style={{ marginTop: 0 }}>{[g.nota, g.registro && `anotó ${g.registro}`].filter(Boolean).join(' · ')}</span>}
        {a.error && <span className="error">{a.error}</span>}
      </span>
      <span className="mov-monto entra">{pesos(g.monto)}</span>
      {editar && !g.anulado && (
        <button type="button" className="enlace quitar" disabled={a.ocupado}
                onClick={() => window.confirm(`¿Anular el pago de ${pesos(g.monto)}? Queda registrado como anulado.`) && a.correr(() => acciones.anularPago(g.id))}>Anular</button>
      )}
    </li>
  );
}

function RegistrarPago({ j, acciones }) {
  const sugerido = j.deudaVencida || (j.proximo ? j.proximo.monto - j.proximo.pagado : 0);
  const [d, setD] = useState({ monto: sugerido, fecha: hoyIso(), medio: 'transferencia', nota: '' });
  const a = useAccion();
  const guardar = (e) => {
    e.preventDefault();
    a.correr(async () => {
      await acciones.registrarPago(j.id, d.monto, d.fecha, d.medio, d.nota.trim());
      setD({ monto: 0, fecha: hoyIso(), medio: 'transferencia', nota: '' });
    }, 'Pago registrado.');
  };
  return (
    <>
      <h2 className="seccion">Registrar pago</h2>
      <form className="card" onSubmit={guardar}>
        <label htmlFor="g-monto">Monto</label>
        <input id="g-monto" required inputMode="numeric" value={campoPesos(d.monto)} onChange={(e) => setD({ ...d, monto: soloNumero(e.target.value) })} />
        <div className="tes-dos">
          <div>
            <label htmlFor="g-fecha">Fecha</label>
            <input id="g-fecha" type="date" required max={hoyIso()} value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} />
          </div>
          <div>
            <label htmlFor="g-medio">Medio</label>
            <select id="g-medio" value={d.medio} onChange={(e) => setD({ ...d, medio: e.target.value })}>
              {Object.entries(MEDIOS).filter(([k]) => k !== 'app').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <label htmlFor="g-nota">Nota (opcional)</label>
        <input id="g-nota" maxLength={200} placeholder="Ej: cuotas marzo y abril" value={d.nota} onChange={(e) => setD({ ...d, nota: e.target.value })} />
        <button className="btn" style={{ marginTop: 16 }} disabled={a.ocupado || !d.monto}>Registrar {d.monto ? pesos(d.monto) : 'pago'}</button>
        <p className="nota">El pago se aplica solo a las cuotas más antiguas que estén pendientes.</p>
        <Avisos a={a} />
      </form>
    </>
  );
}

function Condicion({ j, editar, acciones }) {
  const [d, setD] = useState({
    nombre: j.nombre, apodo: j.apodo ?? '', activo: j.activo, tipo: j.tipo, descuento_pct: Number(j.descuento_pct) || 0, monto_especial: j.monto_especial ?? 0,
    deuda_anterior: j.deuda_anterior || 0, telefono: j.telefono ?? '', correo: j.correo ?? '', comentario: j.comentario ?? '',
  });
  const a = useAccion();
  const set = (k) => (e) => setD({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const guardar = (e) => {
    e.preventDefault();
    a.correr(() => acciones.guardarJugador(j.id, {
      ...d, descuento_pct: Math.min(100, Number(d.descuento_pct) || 0),
      monto_especial: d.tipo === 'especial' ? soloNumero(d.monto_especial) : null,
      deuda_anterior: soloNumero(d.deuda_anterior),
    }), 'Guardado.');
  };
  return (
    <>
      <h2 className="seccion">Condición y contacto</h2>
      <form className="card" onSubmit={guardar}>
        <fieldset disabled={!editar} style={{ border: 0, padding: 0, margin: 0 }}>
          <label htmlFor="c-nombre">Nombre completo</label>
          <input id="c-nombre" required maxLength={80} value={d.nombre} onChange={set('nombre')} />
          <label htmlFor="c-apodo">Apodo (opcional)</label>
          <input id="c-apodo" maxLength={20} placeholder="Ej: el Checho" value={d.apodo} onChange={set('apodo')} />
          <label htmlFor="c-tipo">Condición</label>
          <select id="c-tipo" value={d.tipo} onChange={set('tipo')}>
            {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {(d.tipo === 'beca' || d.tipo === 'normal') && (
            <>
              <label htmlFor="c-desc">Descuento (%)</label>
              <input id="c-desc" type="number" min={0} max={100} step="any" value={d.descuento_pct} onChange={set('descuento_pct')} />
            </>
          )}
          {d.tipo === 'especial' && (
            <>
              <label htmlFor="c-esp">Monto por cuota mensual (no paga inscripción)</label>
              <input id="c-esp" required inputMode="numeric" value={campoPesos(soloNumero(d.monto_especial))} onChange={(e) => setD({ ...d, monto_especial: soloNumero(e.target.value) })} />
            </>
          )}
          <label htmlFor="c-deuda">Deuda de la temporada anterior</label>
          <input id="c-deuda" inputMode="numeric" value={campoPesos(soloNumero(d.deuda_anterior))} onChange={(e) => setD({ ...d, deuda_anterior: soloNumero(e.target.value) })} />
          <label htmlFor="c-tel">Celular</label>
          <input id="c-tel" type="tel" maxLength={30} placeholder="9 1234 5678" value={d.telefono} onChange={set('telefono')} />
          <label htmlFor="c-correo">Correo para cobrar</label>
          <input id="c-correo" type="email" maxLength={120} value={d.correo} onChange={set('correo')} />
          <label htmlFor="c-com">Comentario</label>
          <input id="c-com" maxLength={300} value={d.comentario} onChange={set('comentario')} />
          <label className="casilla">
            <input type="checkbox" checked={d.activo} onChange={set('activo')} />
            <span>Juega esta temporada (si no, no se le cobran cuotas)</span>
          </label>
          {editar && <button className="btn secundario" style={{ marginTop: 16 }} disabled={a.ocupado}>Guardar</button>}
        </fieldset>
        <p className="nota">
          Nombre, celular y correo quedan en el perfil de {j.nombre.split(' ')[0]}; él no los puede cambiar.{' '}
          {j.correo_perfil
            ? `Ya entra a la app con ${j.correo_perfil}: si pones otro correo, queda solo para cobrar.`
            : 'Como todavía no tiene correo, el que pongas será con el que entra a la app.'}
        </p>
        <Avisos a={a} />
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
// Cobrar
// ---------------------------------------------------------------------------
function Cobrar({ p, nombre, abrir }) {
  const [quitados, setQuitados] = useState([]);
  const elegidos = p.deudores.filter((j) => !quitados.includes(j.id));
  const conCorreo = elegidos.filter((j) => j.correo);
  return (
    <>
      <section className="card">
        <div className="item-cabeza">
          <div className="item-que">{plural(p.deudores.length, 'jugador con deuda vencida', 'jugadores con deuda vencida')}</div>
          <div className="item-monto">{pesos(p.deudaVencida)}</div>
        </div>
        {p.deudores.length > 0 && (
          <>
            <a className={`btn${conCorreo.length ? '' : ' secundario'}`} style={{ marginTop: 14 }}
               href={conCorreo.length ? enlaceCorreoMasivo(conCorreo, nombre) : undefined} aria-disabled={!conCorreo.length}>
              Un correo a {plural(conCorreo.length, 'jugador', 'jugadores')} (copia oculta)
            </a>
            {elegidos.length > conCorreo.length && (
              <p className="item-meta">{plural(elegidos.length - conCorreo.length, 'no tiene', 'no tienen')} correo: cóbrales por WhatsApp o agrégalo en su ficha.</p>
            )}
          </>
        )}
      </section>
      <div className="card lista">
        {p.deudores.length === 0 && <p className="item-meta">Nadie tiene deuda vencida. 🎉</p>}
        {p.deudores.map((j) => {
          const wa = enlaceWhatsApp(j, nombre);
          return (
            <div key={j.id} className="fila tes-fila">
              <input type="checkbox" aria-label={`Incluir a ${j.nombre} en el correo`} checked={!quitados.includes(j.id)}
                     onChange={(e) => setQuitados(e.target.checked ? quitados.filter((x) => x !== j.id) : [...quitados, j.id])} />
              <button type="button" className="mov-texto tes-boton" onClick={() => abrir(j.id)}>
                <span className="tes-nombre">{j.nombre}</span>
                <span className="item-meta" style={{ marginTop: 0 }}>{pesos(j.deudaVencida)} · {plural(j.cuotasVencidas, 'cuota', 'cuotas')}</span>
              </button>
              {wa ? <a className="btn chico secundario" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                  : <span className="item-meta" style={{ marginTop: 0 }}>sin celular</span>}
            </div>
          );
        })}
      </div>
      <p className="nota">El correo sale desde tu propia casilla, con todos en copia oculta. El WhatsApp abre un mensaje con el detalle de cada uno.</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Plan de cuotas
// ---------------------------------------------------------------------------
function Cuotas({ p, editar, acciones }) {
  const [filas, setFilas] = useState(() => p.cuotas.map((c) => ({ ...c, vence: String(c.vence).slice(0, 10) })));
  const [aporte, setAporte] = useState(Number(p.aporte_pct) || 0);
  const [gen, setGen] = useState({ inscripcion: 0, cuota: 0, desde: 3, cantidad: 9, dia: 10 });
  const a = useAccion();
  const total = useMemo(() => filas.reduce((t, c) => t + (Number(c.monto) || 0), 0), [filas]);
  const set = (i, k, v) => setFilas(filas.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const guardar = () => a.correr(() => acciones.guardarPlan(
    filas.map((c, i) => ({ numero: c.numero ?? i, nombre: c.nombre.trim() || `Cuota ${i}`, vence: c.vence, monto: Number(c.monto) || 0 })),
    Math.min(100, Number(aporte) || 0),
  ), 'Plan guardado. Las deudas de todo el plantel se recalcularon.');
  const agregar = () => {
    const ultimo = filas.at(-1);
    const numero = filas.reduce((m, c) => Math.max(m, c.numero), 0) + 1;
    setFilas([...filas, { numero, nombre: `Cuota ${numero}`, vence: ultimo?.vence ?? `${TEMPORADA}-03-10`, monto: ultimo?.monto ?? 0 }]);
  };

  return (
    <>
      {editar && (
        <>
          <h2 className="seccion">Armar el plan rápido</h2>
          <section className="card">
            <div className="tes-dos">
              <div><label htmlFor="p-ins">Inscripción</label>
                <input id="p-ins" inputMode="numeric" value={campoPesos(gen.inscripcion)} onChange={(e) => setGen({ ...gen, inscripcion: soloNumero(e.target.value) })} /></div>
              <div><label htmlFor="p-cuota">Cuota mensual</label>
                <input id="p-cuota" inputMode="numeric" value={campoPesos(gen.cuota)} onChange={(e) => setGen({ ...gen, cuota: soloNumero(e.target.value) })} /></div>
              <div><label htmlFor="p-desde">Desde el mes</label>
                <select id="p-desde" value={gen.desde} onChange={(e) => setGen({ ...gen, desde: Number(e.target.value) })}>
                  {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select></div>
              <div><label htmlFor="p-cant">N° de cuotas</label>
                <input id="p-cant" type="number" min={1} max={12} value={gen.cantidad} onChange={(e) => setGen({ ...gen, cantidad: Number(e.target.value) })} /></div>
              <div><label htmlFor="p-dia">Vence el día</label>
                <input id="p-dia" type="number" min={1} max={28} value={gen.dia} onChange={(e) => setGen({ ...gen, dia: Number(e.target.value) })} /></div>
            </div>
            <button type="button" className="btn secundario" style={{ marginTop: 16 }}
                    onClick={() => (filas.length === 0 || window.confirm('Esto reemplaza las cuotas de abajo (no se guarda hasta que toques Guardar). ¿Seguir?'))
                      && setFilas(armarPlan({ temporada: TEMPORADA, ...gen }))}>Armar cuotas</button>
          </section>
        </>
      )}

      <h2 className="seccion">Cuotas {TEMPORADA} · {pesos(total)} por jugador</h2>
      <section className="card">
        {filas.length === 0 && <p className="item-meta" style={{ marginTop: 0 }}>Sin cuotas todavía.</p>}
        {filas.map((c, i) => (
          <div key={i} className="tes-cuota">
            <input aria-label="Nombre de la cuota" maxLength={40} value={c.nombre} disabled={!editar} onChange={(e) => set(i, 'nombre', e.target.value)} />
            <input aria-label="Vence" type="date" value={c.vence} disabled={!editar} onChange={(e) => set(i, 'vence', e.target.value)} />
            <input aria-label="Monto" inputMode="numeric" value={pesos(Number(c.monto) || 0)} disabled={!editar} onChange={(e) => set(i, 'monto', soloNumero(e.target.value))} />
            {editar && <button type="button" className="enlace quitar" onClick={() => setFilas(filas.filter((_, j) => j !== i))}>Quitar</button>}
          </div>
        ))}
        {editar && <button type="button" className="enlace" style={{ marginTop: 12 }} onClick={agregar}>+ Agregar cuota</button>}
        <label htmlFor="p-aporte">Aporte al club (% de lo recaudado)</label>
        <input id="p-aporte" type="number" min={0} max={100} step="any" value={aporte} disabled={!editar} onChange={(e) => setAporte(e.target.value)} />
        {editar && <button type="button" className="btn" style={{ marginTop: 16 }} disabled={a.ocupado} onClick={guardar}>Guardar plan</button>}
        <p className="nota">Cada jugador paga estas cuotas según su condición (beca, descuento, exento o monto especial). Si cambias un monto, se recalcula todo el plantel.</p>
        <Avisos a={a} />
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Caja
// ---------------------------------------------------------------------------
const MOV_VACIO = { fecha: hoyIso(), tipo: 'egreso', categoria: 'liga', motivo: '', monto: 0, programado: false };

function Caja({ p, editar, acciones }) {
  const [d, setD] = useState(MOV_VACIO);
  const [editando, setEditando] = useState(null);
  const a = useAccion();
  const guardar = (e) => {
    e.preventDefault();
    a.correr(async () => { await acciones.guardarMovimiento(editando, { ...d, motivo: d.motivo.trim() }); setD(MOV_VACIO); setEditando(null); }, 'Guardado.');
  };
  const lista = (ms) => (
    <ul className="movimientos">
      {ms.map((m) => (
        <li key={m.id}>
          <span className="mov-texto">
            <span>{m.motivo}</span>
            <span className="item-meta" style={{ marginTop: 0 }}>{fechaCl(m.fecha)} · {CATEGORIAS[m.categoria]}</span>
          </span>
          <span className={`mov-monto${m.tipo === 'ingreso' ? ' entra' : ''}`}>{m.tipo === 'egreso' ? '−' : ''}{pesos(m.monto)}</span>
          {editar && (
            <span className="tes-acciones">
              <button type="button" className="enlace quitar" onClick={() => { setEditando(m.id); setD({ ...m, fecha: String(m.fecha).slice(0, 10) }); window.scrollTo(0, 0); }}>Editar</button>
              <button type="button" className="enlace quitar" onClick={() => window.confirm('¿Borrar este movimiento?') && a.correr(() => acciones.quitarMovimiento(m.id))}>Borrar</button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <section className="card">
        <dl className="total-detalle">
          <div><dt>Cuotas</dt><dd>{pesos(p.recaudado)}</dd></div>
          <div><dt>Otros ingresos</dt><dd>{pesos(p.otrosIngresos)}</dd></div>
          <div><dt>Egresos</dt><dd>{pesos(p.egresos)}</dd></div>
        </dl>
        <dl className="total-detalle" style={{ marginTop: 12 }}>
          <div><dt>Saldo</dt><dd>{pesos(p.saldo)}</dd></div>
          <div><dt>Aporte club ({Number(p.aporte_pct) || 0}%)</dt><dd>{pesos(p.aporte)}</dd></div>
          <div><dt>Por pagar</dt><dd>{pesos(p.porPagarProgramado)}</dd></div>
        </dl>
      </section>

      {editar && (
        <form className="card" onSubmit={guardar}>
          <div className="item-que">{editando ? 'Editar movimiento' : 'Nuevo movimiento'}</div>
          <div className="tes-dos">
            <div><label htmlFor="m-tipo">Tipo</label>
              <select id="m-tipo" value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value })}>
                <option value="egreso">Egreso</option><option value="ingreso">Ingreso</option>
              </select></div>
            <div><label htmlFor="m-cat">Categoría</label>
              <select id="m-cat" value={d.categoria} onChange={(e) => setD({ ...d, categoria: e.target.value })}>
                {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
          </div>
          <label htmlFor="m-motivo">Detalle</label>
          <input id="m-motivo" required maxLength={120} placeholder="Ej: Cuota liga marzo" value={d.motivo} onChange={(e) => setD({ ...d, motivo: e.target.value })} />
          <div className="tes-dos">
            <div><label htmlFor="m-monto">Monto</label>
              <input id="m-monto" required inputMode="numeric" value={campoPesos(d.monto)} onChange={(e) => setD({ ...d, monto: soloNumero(e.target.value) })} /></div>
            <div><label htmlFor="m-fecha">Fecha</label>
              <input id="m-fecha" type="date" required value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} /></div>
          </div>
          <label className="casilla">
            <input type="checkbox" checked={d.programado} onChange={(e) => setD({ ...d, programado: e.target.checked })} />
            <span>Todavía no se paga (programado)</span>
          </label>
          <div className="botones">
            {editando && <button type="button" className="btn secundario" onClick={() => { setEditando(null); setD(MOV_VACIO); }}>Cancelar</button>}
            <button className="btn" disabled={a.ocupado || !d.monto}>Guardar</button>
          </div>
          <Avisos a={a} />
        </form>
      )}

      {p.programados.length > 0 && (<><h2 className="seccion">Por pagar</h2><section className="card">{lista(p.programados)}</section></>)}
      <h2 className="seccion">Movimientos</h2>
      <section className="card">
        {p.movimientos.filter((m) => !m.programado).length === 0 && <p className="item-meta" style={{ marginTop: 0 }}>Sin movimientos todavía.</p>}
        {lista(p.movimientos.filter((m) => !m.programado))}
      </section>
      <p className="nota">Las cuotas de los jugadores entran solas a la caja cuando registras sus pagos. Las compras del club van por Compras.</p>
    </>
  );
}
