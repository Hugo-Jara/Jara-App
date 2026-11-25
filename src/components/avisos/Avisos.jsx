import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { abrirAviso, cargarAvisos, destinatario, fechaAviso, TIPOS_AVISO, vigente } from '../../lib/avisos.js';
import { useSesion } from '../../lib/sesion.jsx';
import Icono from '../Icono.jsx';

const ContextoAvisos = createContext(null);
export const useAvisos = () => useContext(ContextoAvisos);

export function ProveedorAvisos({ activo, children }) {
  const [lista, setLista] = useState([]);
  const [estado, setEstado] = useState({ cargando: true, error: '' });
  const [detalle, setDetalle] = useState(null);
  const consulta = useRef(0);
  const abriendo = useRef(0);

  const recargar = useCallback(async () => {
    const turno = ++consulta.current;
    try {
      const vigentes = await cargarAvisos();
      if (consulta.current !== turno) return;
      setLista(vigentes.filter(vigente));
      setEstado({ cargando: false, error: '' });
      setDetalle((actual) => {
        if (!actual?.aviso) return actual;
        const aviso = vigentes.find((a) => a.id === actual.aviso.id);
        return aviso && vigente(aviso) && aviso.version === actual.aviso.version
          ? { ...actual, aviso } : null;
      });
    } catch (error) {
      if (consulta.current !== turno) return;
      setEstado({ cargando: false, error: error.message });
    }
  }, []);

  useEffect(() => {
    if (!activo) return;
    const alVolver = () => { if (!document.hidden) recargar(); };
    alVolver();
    const intervalo = window.setInterval(alVolver, 30000);
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    return () => {
      ++consulta.current;
      ++abriendo.current;
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
    };
  }, [activo, recargar]);

  useEffect(() => {
    const fechas = lista.flatMap((a) => a.vence_en ? [Date.parse(a.vence_en)] : []);
    if (!fechas.length) return;
    const demora = Math.max(0, Math.min(...fechas) - Date.now());
    const alarma = window.setTimeout(() => {
      setLista((actual) => actual.filter(vigente));
      setDetalle((actual) => actual?.aviso && !vigente(actual.aviso) ? null : actual);
    }, Math.min(demora, 2147483647));
    return () => window.clearTimeout(alarma);
  }, [lista]);

  function cerrar() {
    ++abriendo.current;
    setDetalle(null);
  }

  async function abrir(id) {
    const turno = ++abriendo.current;
    setDetalle({ id, cargando: true });
    try {
      const aviso = await abrirAviso(id);
      if (abriendo.current === turno) {
        setDetalle(aviso ? { id, aviso } : { id, error: 'Este aviso ya no está disponible.' });
      }
      // Una respuesta anterior a la apertura podría traerlo de nuevo sin leer.
      ++consulta.current;
      setLista((actual) => actual.flatMap((a) => {
        if (a.id !== id) return [a];
        if (!aviso) return [];
        return a.version <= aviso.version ? [aviso] : [a];
      }));
      recargar();
    } catch (error) {
      if (abriendo.current === turno) setDetalle({ id, error: error.message, reintento: true });
    }
  }

  return (
    <ContextoAvisos.Provider value={{ avisos: lista, ...estado, abrir, recargar }}>
      {children}
      {detalle && <DetalleAviso detalle={detalle} cerrar={cerrar} abrir={abrir} />}
    </ContextoAvisos.Provider>
  );
}

export function useGestionaAvisos() {
  const { persona, esDemo } = useSesion();
  return esDemo || (!!persona?.editaComunicaciones && !persona.prueba);
}

export function EtiquetaAviso({ aviso }) {
  const { nombre, icono } = TIPOS_AVISO[aviso.tipo];
  return <span className={`aviso-etiqueta aviso-${aviso.tipo}`}><Icono nombre={icono} size={18} />{nombre}</span>;
}

export function ContenidoAviso({ aviso }) {
  return (
    <>
      <EtiquetaAviso aviso={aviso} />
      <h2 className="nota-titulo">{aviso.titulo}</h2>
      <p className="aviso-mensaje">{aviso.mensaje}</p>
      <div className="aviso-meta">
        <span>{destinatario(aviso.equipo)}</span>
        {aviso.autor && <span>Publicado por {aviso.autor} · {fechaAviso(aviso.publicado_en)}</span>}
        <span>{aviso.vence_en ? `Vence el ${fechaAviso(aviso.vence_en)}` : 'Hasta retiro manual'}</span>
      </div>
    </>
  );
}

function DetalleAviso({ detalle, cerrar, abrir }) {
  const dialogo = useRef(null);
  useEffect(() => {
    const elemento = dialogo.current;
    if (!elemento.open) elemento.showModal();
    return () => { if (elemento.open) elemento.close(); };
  }, []);

  return (
    <dialog ref={dialogo} className="card aviso-dialogo"
            aria-label="Detalle del aviso" onCancel={(e) => { e.preventDefault(); cerrar(); }}>
      {detalle.aviso && <ContenidoAviso aviso={detalle.aviso} />}
      {detalle.cargando && <p role="status">Abriendo aviso…</p>}
      {detalle.error && <p className="error" role="alert">{detalle.error}</p>}
      <div className="aviso-acciones">
        <button className="btn secundario chico" onClick={cerrar} autoFocus>Cerrar</button>
        {detalle.reintento && <button className="btn chico" onClick={() => abrir(detalle.id)}>Reintentar</button>}
      </div>
    </dialog>
  );
}

function TarjetaAviso({ aviso, abrir }) {
  return (
    <button type="button" className="card aviso-tarjeta" onClick={() => abrir(aviso.id)}>
      <EtiquetaAviso aviso={aviso} />
      <span className="pub-titulo">{aviso.titulo}</span>
      <span className="aviso-meta">{destinatario(aviso.equipo)}</span>
      <Icono nombre="flecha" size={18} />
    </button>
  );
}

export function AvisosNuevos() {
  const { avisos, abrir } = useAvisos();
  const nuevos = avisos.filter((a) => !a.leido);
  const lista = useRef(null);
  const [posicion, setPosicion] = useState(0);
  const llaves = nuevos.map((a) => a.id).join(',');

  useEffect(() => {
    if (lista.current) lista.current.scrollLeft = 0;
    setPosicion(0);
  }, [llaves]);

  if (!nuevos.length) return null;
  const indice = Math.min(posicion, nuevos.length - 1);
  const mover = (delta) => lista.current.scrollTo({ left: (indice + delta) * lista.current.clientWidth, behavior: 'smooth' });

  return (
    <section className="avisos-inicio" aria-label="Avisos nuevos">
      <div className="avisos-encabezado">
        <h2>Avisos nuevos</h2>
        <div className="avisos-navegacion">
          {nuevos.length > 1 && <button className="avisos-anterior" aria-label="Aviso anterior" disabled={!indice} onClick={() => mover(-1)}><Icono nombre="flecha" size={16} /></button>}
          <span aria-live="polite">{indice + 1} de {nuevos.length}</span>
          {nuevos.length > 1 && <button aria-label="Aviso siguiente" disabled={indice === nuevos.length - 1} onClick={() => mover(1)}><Icono nombre="flecha" size={16} /></button>}
        </div>
      </div>
      <div ref={lista} className="avisos-carrusel" onScroll={(e) => setPosicion(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {nuevos.map((aviso) => <TarjetaAviso key={aviso.id} aviso={aviso} abrir={abrir} />)}
      </div>
    </section>
  );
}

export function AvisosLeidos() {
  const { avisos, abrir } = useAvisos();
  const leidos = avisos.filter((a) => a.leido);
  if (!leidos.length) return null;
  return (
    <section className="avisos-inicio" aria-label="Avisos vigentes">
      <div className="avisos-encabezado"><h2>Avisos vigentes</h2></div>
      {leidos.map((aviso) => <TarjetaAviso key={aviso.id} aviso={aviso} abrir={abrir} />)}
    </section>
  );
}

export function AvisosNoticias({ soloAvisos }) {
  const { avisos, abrir, cargando, error, recargar } = useAvisos();
  const gestiona = useGestionaAvisos();
  return (
    <section aria-label="Avisos">
      {gestiona && soloAvisos && <Link className="btn secundario aviso-gestionar" to="/noticias/avisos/gestionar">Gestionar avisos</Link>}
      {soloAvisos && cargando && <p role="status" className="vacio suelto">Cargando avisos…</p>}
      {soloAvisos && error && <div className="card"><p className="error" role="alert">{error}</p>
        <button className="btn secundario chico" onClick={recargar}>Reintentar</button>
      </div>}
      {soloAvisos && !avisos.length && !cargando && !error && <p className="vacio suelto">No hay avisos vigentes.</p>}
      {avisos.map((aviso) => <TarjetaAviso key={aviso.id} aviso={aviso} abrir={abrir} />)}
    </section>
  );
}
