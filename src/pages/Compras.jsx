import { useState } from 'react';
import { useCompras, TOPICOS } from '../lib/compras.js';
import { totales, pesos } from '../lib/pedido.js';
import { BASE } from '../lib/base.js';
import { Formulario, Item } from './Pedido.jsx';

// Compras dentro de la app: las mismas listas del link de pedido. Cada socio
// pide sus compras y las sigue; Hacienda las revisa y entrega la plata.

const linkDe = (token) => `${window.location.origin}${BASE}pedido/${token}`;

// Pedir una compra: primero el tópico, después la lista (si hay más de una abierta).
function Pedir({ listas, alAgregar, alCancelar }) {
  const abiertas = listas.filter((l) => l.abierto);
  const topicos = Object.keys(TOPICOS).filter((t) => abiertas.some((l) => l.topico === t));
  const [topico, setTopico] = useState(topicos.length === 1 ? topicos[0] : '');
  const deTopico = abiertas.filter((l) => l.topico === topico);
  const [listaId, setListaId] = useState('');
  const elegida = deTopico.length === 1 ? deTopico[0] : deTopico.find((l) => l.id === listaId);

  if (!topicos.length) {
    return <p className="vacio suelto">No hay listas abiertas para pedir compras. Avísale a Hacienda.</p>;
  }
  return (
    <>
      <div className="card">
        <div className="sobretitulo">¿Para qué es la compra?</div>
        <div className="chips" role="radiogroup" aria-label="Tópico">
          {topicos.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={topico === t}
                    className={`chip ${topico === t ? 'activo' : ''}`} onClick={() => { setTopico(t); setListaId(''); }}>
              {TOPICOS[t]}
            </button>
          ))}
        </div>
        {deTopico.length > 1 && (
          <>
            <label htmlFor="c-lista">¿En qué lista?</label>
            <select id="c-lista" value={listaId} onChange={(e) => setListaId(e.target.value)}>
              <option value="">Elige una lista</option>
              {deTopico.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </>
        )}
        {!elegida && <div className="botones"><button type="button" className="btn secundario" onClick={alCancelar}>Cancelar</button></div>}
      </div>
      {elegida && (
        <Formulario conNombre={false} onCancelar={alCancelar}
                    onGuardar={async (d) => { await alAgregar(elegida, d); alCancelar(); }} />
      )}
    </>
  );
}

// Hacienda: tópico, abrir o cerrar, y el link para quien no tiene cuenta.
function Lista({ l, cambiar }) {
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const hacer = async (topico, abierto) => {
    setError(''); setOcupado(true);
    try { await cambiar(l.id, topico, abierto); } catch (e) { setError(e.message); }
    setOcupado(false);
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(linkDe(l.token)); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
    catch { window.prompt('Copia el link:', linkDe(l.token)); }
  };
  return (
    <li className="item">
      <div className="item-cabeza">
        <span className="item-que">{l.nombre}</span>
        <span className="marca">{l.abierto ? 'Abierta' : 'Cerrada'}</span>
      </div>
      <label htmlFor={`t${l.id}`}>Tópico</label>
      <select id={`t${l.id}`} value={l.topico} disabled={ocupado} onChange={(e) => hacer(e.target.value, l.abierto)}>
        {Object.entries(TOPICOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
      <div className="item-links correcciones">
        <button type="button" className="enlace" disabled={ocupado} onClick={() => hacer(l.topico, !l.abierto)}>
          {l.abierto ? 'Cerrar la lista' : 'Volver a abrirla'}
        </button>
        {l.token && l.abierto && (
          <button type="button" className="enlace" onClick={copiar}>{copiado ? 'Link copiado' : 'Copiar link para quien no tiene cuenta'}</button>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </li>
  );
}

export default function Compras() {
  const { cargando, error, datos, recargar, agregar, cambiarLista, ...acciones } = useCompras();
  const [pidiendo, setPidiendo] = useState(false);
  const [filtro, setFiltro] = useState('todas');
  const [verListas, setVerListas] = useState(false);

  if (cargando) return <p className="vacio suelto">Cargando…</p>;
  if (!datos) {
    return (
      <>
        <h1 className="titulo display">Compras</h1>
        <p className="error" role="alert">{error}</p>
        <button className="btn secundario" onClick={recargar}>Reintentar</button>
      </>
    );
  }

  const hacienda = datos.esHacienda;
  const listaDe = Object.fromEntries(datos.listas.map((l) => [l.id, l]));
  const visibles = datos.items.filter((i) => filtro === 'todas' || listaDe[i.pedidoId]?.topico === filtro);
  const t = totales(visibles);
  return (
    <>
      <h1 className="titulo display">Compras</h1>
      <p className="subtitulo">
        Ninguna compra se paga sin cotización aprobada por Hacienda.
        {datos.veTodas ? ' Ves las compras de todo el club.' : ' Acá ves las compras que pediste tú.'}
      </p>

      {pidiendo
        ? <Pedir listas={datos.listas} alAgregar={agregar} alCancelar={() => setPidiendo(false)} />
        : <button className="btn" onClick={() => setPidiendo(true)}>Pedir una compra</button>}

      <div className="filtros" role="radiogroup" aria-label="Tópico" style={{ marginTop: 18 }}>
        {[['todas', 'Todas'], ...Object.entries(TOPICOS)].map(([v, texto]) => (
          <button key={v} type="button" role="radio" aria-checked={filtro === v}
                  className={`filtro ${filtro === v ? 'activo' : ''}`} onClick={() => setFiltro(v)}>{texto}</button>
        ))}
      </div>

      <section className="card total">
        <div className="sobretitulo">{datos.veTodas ? 'Total pedido a Hacienda' : 'Lo que pediste'}</div>
        <div className="total-monto display">{pesos(t.pedido)}</div>
        <dl className="total-detalle">
          <div><dt>Aprobado</dt><dd>{pesos(t.aprobado)}</dd></div>
          <div><dt>Entregado</dt><dd>{pesos(t.entregado)}</dd></div>
          <div><dt>Con boleta</dt><dd>{pesos(t.respaldado)}</dd></div>
        </dl>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      <h2 className="seccion">{datos.veTodas ? 'Compras' : 'Mis compras'} · {visibles.length}</h2>
      {visibles.length === 0
        ? <p className="vacio suelto">{datos.veTodas ? 'No hay compras en este tópico.' : 'Todavía no pides ninguna compra.'}</p>
        : (
          <ul className="card lista items">
            {visibles.map((i) => (
              <Item key={i.id} item={i} hacienda={hacienda} propia={i.esMia} conNombre={false}
                    puedoVerComprobantes={datos.puedoVerComprobantes} acciones={acciones}
                    detalle={listaDe[i.pedidoId]?.nombre} />
            ))}
          </ul>
        )}

      {hacienda && (
        <>
          <h2 className="seccion">Listas · {datos.listas.length}</h2>
          {verListas ? (
            <>
              <p className="ayuda">Corrige el tópico de una lista o ciérrala. A una lista cerrada no se le piden compras, ni en la app ni con el link.</p>
              <ul className="card lista items">
                {datos.listas.map((l) => <Lista key={l.id} l={l} cambiar={cambiarLista} />)}
              </ul>
            </>
          ) : (
            <button className="btn secundario" onClick={() => setVerListas(true)}>Ver y corregir las listas</button>
          )}
        </>
      )}
    </>
  );
}
