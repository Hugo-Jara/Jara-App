import { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { usePedido, totales, pesos, ESTADOS } from '../lib/pedido.js';
import { esDemo } from '../lib/supabase.js';
import { ESCUDO } from '../lib/base.js';

const esLink = (texto) => /^https?:\/\//i.test(texto.trim());

function recordarNombre(nombre) {
  try { localStorage.setItem('pedido-nombre', nombre); } catch { /* sin almacenamiento, no pasa nada */ }
}
function nombreRecordado() {
  try { return localStorage.getItem('pedido-nombre') || ''; } catch { return ''; }
}

// Un archivo adjunto: enlace si ya está subido, o solo su nombre en la demostración.
function Adjunto({ archivo, texto }) {
  if (!archivo) return null;
  return archivo.url
    ? <a className="enlace" href={archivo.url} target="_blank" rel="noreferrer">{texto}</a>
    : <span className="tenue">{texto}: {archivo.nombre}</span>;
}

// Botón que abre el selector de archivos del teléfono o del computador.
function BotonArchivo({ className, disabled, onArchivo, children }) {
  const entrada = useRef(null);
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => entrada.current.click()}>
        {children}
      </button>
      <input ref={entrada} type="file" accept="image/*,application/pdf" hidden
             onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onArchivo(f); }} />
    </>
  );
}

// Sirve para agregar una compra y para corregir una devuelta (`inicial`).
function Formulario({ inicial, onGuardar, onCancelar }) {
  const [d, setD] = useState({
    quien: inicial?.quien ?? nombreRecordado(), que: inicial?.que ?? '',
    monto: inicial?.monto ?? '', referencia: inicial?.referencia ?? '',
  });
  const [cotizacion, setCotizacion] = useState(null);
  const [refArchivo, setRefArchivo] = useState(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (campo) => (e) => setD({ ...d, [campo]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    const monto = Number(String(d.monto).replace(/\D/g, ''));
    if (!monto) return setError('Escribe el monto en pesos, solo números.');
    if (!cotizacion && !inicial?.cotizacion) return setError('Falta adjuntar la cotización: foto, PDF o pantallazo.');
    if (!d.referencia.trim() && !refArchivo && !inicial?.referenciaArchivo) {
      return setError('Falta la referencia: pega un link o un contacto, o adjunta un archivo.');
    }
    setError(''); setGuardando(true);
    try {
      recordarNombre(d.quien.trim());
      await onGuardar({
        quien: d.quien.trim(), que: d.que.trim(), monto, referencia: d.referencia.trim(),
        cotizacionArchivo: cotizacion, referenciaArchivo: refArchivo,
      });
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  return (
    <form className="card" onSubmit={enviar}>
      <div className="sobretitulo">{inicial ? 'Corregir compra' : 'Nueva compra'}</div>
      <label htmlFor="quien">Tu nombre</label>
      <input id="quien" required value={d.quien} onChange={set('quien')} autoComplete="name" />
      <label htmlFor="que">Qué quieres comprar</label>
      <input id="que" required value={d.que} onChange={set('que')} placeholder="Ej.: carne para el asado, 25 kg" />
      <label htmlFor="monto">Cuánto sale (en pesos)</label>
      <input id="monto" required inputMode="numeric" value={d.monto} onChange={set('monto')} placeholder="187500" />

      <label htmlFor="cotizacion">
        Cotización (foto, PDF o pantallazo){inicial?.cotizacion ? `. Ya tiene: ${inicial.cotizacion.nombre}` : ''}
      </label>
      <input id="cotizacion" type="file" accept="image/*,application/pdf"
             onChange={(e) => { setCotizacion(e.target.files[0] || null); setError(''); }} />

      <fieldset className="bloque">
        <legend>Referencia</legend>
        <p className="ayuda">Un link, un contacto o un archivo. Con uno basta.</p>
        <label htmlFor="referencia">Link del producto o contacto del proveedor</label>
        <input id="referencia" value={d.referencia} onChange={set('referencia')} placeholder="https://…" />
        <label htmlFor="ref-archivo">
          O adjunta un archivo{inicial?.referenciaArchivo ? `. Ya tiene: ${inicial.referenciaArchivo.nombre}` : ''}
        </label>
        <input id="ref-archivo" type="file" accept="image/*,application/pdf"
               onChange={(e) => { setRefArchivo(e.target.files[0] || null); setError(''); }} />
      </fieldset>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="botones">
        <button className="btn" disabled={guardando}>{guardando ? 'Guardando…' : inicial ? 'Reenviar' : 'Agregar'}</button>
        <button type="button" className="btn secundario" onClick={onCancelar} disabled={guardando}>Cancelar</button>
      </div>
    </form>
  );
}

// Hacienda corrige el nombre, la glosa o el monto de una compra ya ingresada.
function Edicion({ item, onGuardar, onCancelar }) {
  const [d, setD] = useState({ quien: item.quien, que: item.que, monto: String(item.monto) });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (campo) => (e) => setD({ ...d, [campo]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    const monto = Number(d.monto.replace(/\D/g, ''));
    if (!monto) return setError('Escribe el monto en pesos, solo números.');
    setError(''); setGuardando(true);
    try {
      await onGuardar({ quien: d.quien.trim(), que: d.que.trim(), monto });
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  return (
    <form className="card" onSubmit={enviar}>
      <div className="sobretitulo">Editar compra</div>
      <label htmlFor={`eq${item.id}`}>Quién compra</label>
      <input id={`eq${item.id}`} required value={d.quien} onChange={set('quien')} />
      <label htmlFor={`eg${item.id}`}>Glosa (qué se compra)</label>
      <input id={`eg${item.id}`} required value={d.que} onChange={set('que')} />
      <label htmlFor={`em${item.id}`}>Monto (en pesos)</label>
      <input id={`em${item.id}`} required inputMode="numeric" value={d.monto} onChange={set('monto')} />
      <p className="ayuda abajo">Los archivos y el estado de la compra no cambian.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="botones">
        <button className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn secundario" onClick={onCancelar} disabled={guardando}>Cancelar</button>
      </div>
    </form>
  );
}

function Item({ item, hacienda, acciones }) {
  const [comentario, setComentario] = useState('');
  const [modo, setModo] = useState(null); // 'devolver' | 'corregir' | 'editar' | 'eliminar'
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const hacer = async (f) => {
    setError(''); setOcupado(true);
    try { await f(); setModo(null); } catch (e) { setError(e.message); }
    setOcupado(false);
  };

  if (modo === 'corregir') {
    return (
      <li className="item">
        <Formulario inicial={item} onCancelar={() => setModo(null)}
                    onGuardar={async (d) => { await acciones.corregir(item, d); setModo(null); }} />
      </li>
    );
  }
  if (modo === 'editar') {
    return (
      <li className="item">
        <Edicion item={item} onCancelar={() => setModo(null)}
                 onGuardar={async (d) => { await acciones.editar(item.id, d); setModo(null); }} />
      </li>
    );
  }
  const conPlata = ['entregado', 'respaldado'].includes(item.estado);
  return (
    <li className="item">
      <div className="item-cabeza">
        <span className="item-que">{item.que}</span>
        <span className="item-monto">{pesos(item.monto)}</span>
      </div>
      <div className="item-meta">
        {item.quien} · <span className={`estado ${item.estado}`}>{ESTADOS[item.estado]}</span>
      </div>
      {item.comentario && item.estado === 'devuelto' && <p className="item-comentario">{item.comentario}</p>}
      <div className="item-links">
        <Adjunto archivo={item.cotizacion} texto="Ver cotización" />
        {item.referencia && (esLink(item.referencia)
          ? <a className="enlace" href={item.referencia} target="_blank" rel="noreferrer">Ver referencia</a>
          : <span className="tenue">{item.referencia}</span>)}
        <Adjunto archivo={item.referenciaArchivo} texto="Ver archivo de referencia" />
        {hacienda
          ? <Adjunto archivo={item.comprobante} texto="Ver comprobante" />
          : item.conComprobante && <span className="tenue">Transferencia con comprobante</span>}
        <Adjunto archivo={item.boleta} texto="Ver boleta" />
      </div>

      {hacienda && ['pendiente', 'aprobado'].includes(item.estado) && !modo && (
        <div className="botones chicos">
          {item.estado === 'pendiente' && (
            <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => acciones.revisar(item.id, 'aprobar'))}>Aprobar</button>
          )}
          {item.estado === 'aprobado' && (
            <>
              <BotonArchivo className="btn chico" disabled={ocupado}
                            onArchivo={(f) => hacer(() => acciones.subirComprobante(item.id, f))}>
                {ocupado ? 'Subiendo…' : 'Entregar con comprobante'}
              </BotonArchivo>
              <button className="btn chico secundario" disabled={ocupado} onClick={() => hacer(() => acciones.revisar(item.id, 'entregar'))}>Entregar sin comprobante</button>
            </>
          )}
          <button className="btn chico secundario" disabled={ocupado} onClick={() => setModo('devolver')}>Devolver</button>
        </div>
      )}
      {hacienda && modo === 'devolver' && (
        <form onSubmit={(e) => { e.preventDefault(); hacer(() => acciones.revisar(item.id, 'devolver', comentario)); }}>
          <label htmlFor={`m${item.id}`}>Qué falta o qué hay que corregir</label>
          <input id={`m${item.id}`} required value={comentario} onChange={(e) => setComentario(e.target.value)} />
          <div className="botones chicos">
            <button className="btn chico" disabled={ocupado}>Devolver</button>
            <button type="button" className="btn chico secundario" onClick={() => setModo(null)}>Cancelar</button>
          </div>
        </form>
      )}
      {hacienda && conPlata && !item.conComprobante && !modo && (
        <div className="botones chicos">
          <BotonArchivo className="btn chico secundario" disabled={ocupado}
                        onArchivo={(f) => hacer(() => acciones.subirComprobante(item.id, f))}>
            {ocupado ? 'Subiendo…' : 'Agregar comprobante'}
          </BotonArchivo>
        </div>
      )}
      {/* Correcciones de Hacienda: enlaces discretos, aparte de las acciones del flujo. */}
      {hacienda && !modo && (
        <div className="item-links correcciones">
          {conPlata && item.conComprobante && (
            <BotonArchivo className="enlace" disabled={ocupado}
                          onArchivo={(f) => hacer(() => acciones.subirComprobante(item.id, f))}>
              {ocupado ? 'Subiendo…' : 'Cambiar comprobante'}
            </BotonArchivo>
          )}
          <button type="button" className="enlace" disabled={ocupado} onClick={() => setModo('editar')}>Editar</button>
          <button type="button" className="enlace" disabled={ocupado} onClick={() => setModo('eliminar')}>Eliminar</button>
        </div>
      )}
      {hacienda && modo === 'eliminar' && (
        <div className="item-comentario">
          ¿Eliminar esta compra? Deja de verse y de sumar en el pedido.
          {conPlata && <strong> Ojo: ya tiene plata entregada.</strong>}
          <div className="botones chicos">
            <button className="btn chico" disabled={ocupado} onClick={() => hacer(() => acciones.eliminar(item.id))}>
              {ocupado ? 'Eliminando…' : 'Sí, eliminar'}
            </button>
            <button type="button" className="btn chico secundario" disabled={ocupado} onClick={() => setModo(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {!hacienda && item.estado === 'devuelto' && (
        <div className="botones chicos">
          <button className="btn chico" onClick={() => setModo('corregir')}>Corregir y reenviar</button>
        </div>
      )}
      {!hacienda && item.estado === 'entregado' && (
        <label className="foto-agregar boleta">
          {ocupado ? 'Subiendo…' : 'Subir boleta'}
          <input type="file" accept="image/*,application/pdf" hidden disabled={ocupado}
                 onChange={(e) => e.target.files[0] && hacer(() => acciones.subirBoleta(item.id, e.target.files[0]))} />
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </li>
  );
}

export default function Pedido() {
  const token = useLocation().pathname.split('/')[2] || '';
  const [haciendaDemo, setHaciendaDemo] = useState(false);
  const { cargando, error, pedido, ...acciones } = usePedido(token, haciendaDemo);
  const [agregando, setAgregando] = useState(false);

  if (cargando) return <div className="cargando">Cargando…</div>;
  if (!pedido) {
    return (
      <div className="pagina suelta">
        <p className="vacio">{error || 'Este link no es válido.'} Pídele el link de nuevo a quien te lo mandó.</p>
      </div>
    );
  }
  const t = totales(pedido.items);
  const hacienda = pedido.esHacienda;
  return (
    <div className="pagina suelta">
      <header className="barra">
        <img src={ESCUDO} alt="Escudo del Club Hugo Jara" />
        <div className="barra-texto">
          <div className="barra-nombre display">Compras{hacienda ? ' · Hacienda' : ''}</div>
          <div className="barra-sub">{pedido.nombre} · Club Deportivo Hugo Jara</div>
        </div>
      </header>

      <section className="card total">
        <div className="sobretitulo">Total pedido a Hacienda</div>
        <div className="total-monto display">{pesos(t.pedido)}</div>
        <dl className="total-detalle">
          <div><dt>Aprobado</dt><dd>{pesos(t.aprobado)}</dd></div>
          <div><dt>Entregado</dt><dd>{pesos(t.entregado)}</dd></div>
          <div><dt>Con boleta</dt><dd>{pesos(t.respaldado)}</dd></div>
        </dl>
      </section>

      {!pedido.abierto
        ? <p className="vacio suelto">Este pedido está cerrado: ya no se agregan compras.</p>
        : agregando
          ? <Formulario onGuardar={async (d) => { await acciones.agregar(d); setAgregando(false); }} onCancelar={() => setAgregando(false)} />
          : <button className="btn" onClick={() => setAgregando(true)}>Agregar una compra</button>}

      <h2 className="seccion">Lo pedido hasta ahora · {pedido.items.length}</h2>
      {pedido.items.length === 0
        ? <p className="vacio suelto">Todavía no hay compras. Agrega la primera.</p>
        : (
          <ul className="card lista items">
            {pedido.items.map((i) => <Item key={i.id} item={i} hacienda={hacienda} acciones={acciones} />)}
          </ul>
        )}

      {esDemo && (
        <label className="casilla tenue">
          <input type="checkbox" checked={haciendaDemo} onChange={(e) => setHaciendaDemo(e.target.checked)} />
          Vista de Hacienda (en la versión real se entra con un link aparte)
        </label>
      )}
    </div>
  );
}
