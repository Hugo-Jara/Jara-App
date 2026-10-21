import { useState } from 'react';
import { useCompras } from '../lib/compras.js';
import { totales, pesos } from '../lib/pedido.js';
import { BASE } from '../lib/base.js';
import { Formulario, Item } from './Pedido.jsx';

// Compras dentro de la app: se entra por tópico, no por lista. Cada socio pide
// sus compras y las sigue; Hacienda las revisa y entrega la plata.

const linkDe = (token) => `${window.location.origin}${BASE}solicitar/${token}`;

// Hacienda: el link para quien no tiene cuenta y cerrar el tópico.
function AdministrarTopico({ t, cambiar }) {
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(linkDe(t.token)); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
    catch { window.prompt('Copia el link:', linkDe(t.token)); }
  };
  const cerrar = async () => {
    setError(''); setOcupado(true);
    try { await cambiar(t.slug, false); } catch (e) { setError(e.message); setOcupado(false); }
  };
  return (
    <div className="card">
      <div className="sobretitulo">Para quien no tiene cuenta</div>
      <p className="ayuda">Con este link se envían solicitudes a "{t.nombre}" sin entrar a la app. Quien lo usa no ve las solicitudes de nadie.</p>
      <div className="botones chicos">
        <button type="button" className="btn chico" onClick={copiar}>{copiado ? 'Link copiado' : 'Copiar el link'}</button>
        {!confirmando && <button type="button" className="btn chico secundario" onClick={() => setConfirmando(true)}>Cerrar el tópico</button>}
      </div>
      {confirmando && (
        <div className="item-comentario">
          ¿Cerrar "{t.nombre}"? Nadie podrá enviar solicitudes, ni con la app ni con el link, hasta que lo reabras. Las solicitudes quedan guardadas.
          <div className="botones chicos">
            <button className="btn chico" disabled={ocupado} onClick={cerrar}>{ocupado ? 'Cerrando…' : 'Sí, cerrar'}</button>
            <button type="button" className="btn chico secundario" disabled={ocupado} onClick={() => setConfirmando(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

// Un tópico por dentro: pedir una compra, los totales y las solicitudes.
function Topico({ t, datos, acciones, hacienda, alVolver }) {
  const [pidiendo, setPidiendo] = useState(false);
  const items = datos.items.filter((i) => i.topico === t.slug);
  const tot = totales(items);
  return (
    <>
      {alVolver && <p className="ayuda"><button className="enlace" onClick={alVolver}>← Todos los tópicos</button></p>}
      <h1 className="titulo display">{t.nombre}</h1>
      <p className="subtitulo">
        Ninguna compra se paga sin cotización aprobada por Hacienda.
        {datos.veTodas ? ' Ves las solicitudes de todo el club.' : ' Acá ves las solicitudes que hiciste tú.'}
      </p>

      {pidiendo
        ? <Formulario conNombre={false} enviarTexto="Enviar solicitud" onCancelar={() => setPidiendo(false)}
                      onGuardar={async (d) => { await acciones.agregar(t, d); setPidiendo(false); }} />
        : <button className="btn" onClick={() => setPidiendo(true)}>Pedir una compra</button>}

      <section className="card total" style={{ marginTop: 18 }}>
        <div className="sobretitulo">{datos.veTodas ? 'Total pedido a Hacienda' : 'Lo que pediste'}</div>
        <div className="total-monto display">{pesos(tot.pedido)}</div>
        <dl className="total-detalle">
          <div><dt>Aprobado</dt><dd>{pesos(tot.aprobado)}</dd></div>
          <div><dt>Entregado</dt><dd>{pesos(tot.entregado)}</dd></div>
          <div><dt>Con boleta</dt><dd>{pesos(tot.respaldado)}</dd></div>
        </dl>
      </section>

      <h2 className="seccion">{datos.veTodas ? 'Solicitudes' : 'Mis solicitudes'} · {items.length}</h2>
      {items.length === 0
        ? <p className="vacio suelto">{datos.veTodas ? 'Todavía no hay solicitudes en este tópico.' : 'Todavía no haces ninguna solicitud.'}</p>
        : (
          <ul className="card lista items">
            {items.map((i) => (
              <Item key={i.id} item={i} hacienda={hacienda} propia={i.esMia} conNombre={false}
                    puedoVerComprobantes={datos.puedoVerComprobantes} acciones={acciones} />
            ))}
          </ul>
        )}

      {hacienda && <AdministrarTopico t={t} cambiar={acciones.cambiarTopico} />}
    </>
  );
}

// Hacienda: los tópicos cerrados, para reabrirlos.
function Cerrados({ topicos, cambiar }) {
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState('');
  const reabrir = async (slug) => {
    setError(''); setOcupado(slug);
    try { await cambiar(slug, true); } catch (e) { setError(e.message); }
    setOcupado('');
  };
  if (!topicos.length) return null;
  return (
    <>
      <h2 className="seccion">Tópicos cerrados · {topicos.length}</h2>
      <ul className="card lista items">
        {topicos.map((t) => (
          <li key={t.slug} className="item">
            <div className="item-cabeza">
              <span className="item-que">{t.nombre}</span>
              <button type="button" className="enlace" disabled={!!ocupado} onClick={() => reabrir(t.slug)}>
                {ocupado === t.slug ? 'Abriendo…' : 'Reabrir'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

export default function Compras() {
  const { cargando, error, datos, recargar, ...acciones } = useCompras();
  const [elegido, setElegido] = useState('');

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
  const activos = datos.topicos.filter((t) => t.activo);
  const cerrados = datos.topicos.filter((t) => !t.activo);
  // Con un solo tópico abierto se entra directo; con varios, se elige uno.
  const actual = activos.find((t) => t.slug === elegido) ?? (activos.length === 1 ? activos[0] : null);

  if (actual) {
    return (
      <>
        {error && <p className="error" role="alert">{error}</p>}
        <Topico t={actual} datos={datos} acciones={acciones} hacienda={hacienda}
                alVolver={activos.length > 1 ? () => setElegido('') : null} />
        {hacienda && <Cerrados topicos={cerrados} cambiar={acciones.cambiarTopico} />}
      </>
    );
  }
  return (
    <>
      <h1 className="titulo display">Compras</h1>
      <p className="subtitulo">Ninguna compra se paga sin cotización aprobada por Hacienda.</p>
      {activos.length === 0
        ? <p className="vacio suelto">Por ahora no hay tópicos abiertos para pedir compras.</p>
        : (
          <>
            <div className="sobretitulo">¿Para qué es la compra?</div>
            <ul className="opciones">
              {activos.map((t) => (
                <li key={t.slug}>
                  <button className="opcion" onClick={() => setElegido(t.slug)}>
                    <span className="opcion-nombre">{t.nombre}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      {hacienda && <Cerrados topicos={cerrados} cambiar={acciones.cambiarTopico} />}
    </>
  );
}
