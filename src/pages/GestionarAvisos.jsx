import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ContenidoAviso, EtiquetaAviso, useAvisos, useGestionaAvisos } from '../components/avisos/Avisos.jsx';
import { cargarHistorial, destinatario, ESTADOS_AVISO, fechaAviso, guardarAviso, retirarAviso,
  TIPOS_AVISO, vencimientoAviso, VIGENCIAS_AVISO } from '../lib/avisos.js';
import { useSesion } from '../lib/sesion.jsx';

const NUEVO = { titulo: '', mensaje: '', tipo: 'informativo', equipo_id: '', vigencia: '24h' };

function fechaLocal(iso) {
  if (!iso) return '';
  const fecha = new Date(iso);
  return new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function EditorAviso({ aviso, planteles, salir, guardado }) {
  const [datos, setDatos] = useState(aviso
    ? { ...aviso, equipo_id: aviso.equipo_id || '', fecha: fechaLocal(aviso.vence_en), sinFecha: !aviso.vence_en }
    : NUEVO);
  const [previa, setPrevia] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const asignar = (campo) => (e) => setDatos({ ...datos, [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  function previsualizar(evento) {
    evento.preventDefault();
    setError('');
    const ahora = Date.now();
    let vence = aviso ? aviso.vence_en : vencimientoAviso(datos.vigencia, ahora);
    if (aviso && datos.cambiarVencimiento) {
      const fecha = new Date(datos.fecha);
      if (!datos.sinFecha && (!Number.isFinite(fecha.getTime()) || fecha.getTime() <= ahora)) {
        setError('El vencimiento debe ser una fecha futura.');
        return;
      }
      vence = datos.sinFecha ? null : fecha.toISOString();
    }
    if (!datos.titulo.trim() || !datos.mensaje.trim()) {
      setError('Escribe el título y el mensaje del aviso.');
      return;
    }
    setPrevia({
      ...datos, titulo: datos.titulo.trim(), mensaje: datos.mensaje.trim(),
      equipo: planteles.find((equipo) => equipo.id === datos.equipo_id)?.nombre, vence_en: vence,
    });
  }

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      await guardarAviso({ ...previa, cambiarVencimiento: !!previa.cambiarVencimiento, renotificar: !!previa.renotificar }, aviso);
      guardado(aviso ? 'Cambios guardados.' : 'Aviso publicado.');
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  if (previa) {
    return (
      <section aria-label="Vista previa">
        <h2 className="nota-titulo">Vista previa</h2>
        <article className="card aviso-editor"><ContenidoAviso aviso={previa} /></article>
        {previa.renotificar && <p className="subtitulo">Volverá a aparecer como nuevo para los destinatarios seleccionados.</p>}
        {error && <p role="alert" className="error">{error}</p>}
        <div className="aviso-acciones">
          <button className="btn secundario" disabled={guardando} onClick={() => { setPrevia(null); setError(''); }}>Volver al editor</button>
          <button className="btn" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : aviso ? 'Guardar cambios' : 'Publicar aviso'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="card aviso-editor" onSubmit={previsualizar}>
      <h2 className="nota-titulo">{aviso ? 'Editar aviso' : 'Nuevo aviso'}</h2>
      <label htmlFor="aviso-titulo">Título</label>
      <input id="aviso-titulo" required maxLength={100} value={datos.titulo} onChange={asignar('titulo')} />
      <label htmlFor="aviso-mensaje">Mensaje breve</label>
      <textarea id="aviso-mensaje" required rows={3} maxLength={500} value={datos.mensaje} onChange={asignar('mensaje')} />
      <label htmlFor="aviso-tipo">Tipo de aviso</label>
      <select id="aviso-tipo" value={datos.tipo} onChange={asignar('tipo')}>
        {Object.entries(TIPOS_AVISO).map(([id, { nombre }]) => <option key={id} value={id}>{nombre}</option>)}
      </select>
      <label htmlFor="aviso-equipo">Destinatario</label>
      <select id="aviso-equipo" value={datos.equipo_id} onChange={asignar('equipo_id')}>
        <option value="">Todos los socios</option>
        {planteles.map((equipo) => <option key={equipo.id} value={equipo.id}>{destinatario(equipo.nombre)}</option>)}
      </select>

      {aviso ? (
        <>
          <div className="aviso-meta aviso-vigencia">Vencimiento actual · {aviso.vence_en ? fechaAviso(aviso.vence_en) : 'Hasta retiro manual'}</div>
          <label className="casilla"><input type="checkbox" checked={!!datos.cambiarVencimiento} onChange={asignar('cambiarVencimiento')} />Cambiar vencimiento</label>
          {datos.cambiarVencimiento && (
            <>
              <label className="casilla"><input type="checkbox" checked={!!datos.sinFecha} onChange={asignar('sinFecha')} />Hasta retirarlo manualmente</label>
              {!datos.sinFecha && <div>
                <label htmlFor="aviso-vence">Nuevo vencimiento (hora de este dispositivo)</label>
                <input id="aviso-vence" type="datetime-local" required value={datos.fecha} onChange={asignar('fecha')} />
              </div>}
            </>
          )}
          <label className="casilla"><input type="checkbox" checked={!!datos.renotificar} onChange={asignar('renotificar')} />Volver a notificar a los destinatarios</label>
        </>
      ) : (
        <>
          <label htmlFor="aviso-vigencia">Vigencia desde la publicación</label>
          <select id="aviso-vigencia" value={datos.vigencia} onChange={asignar('vigencia')}>
            {Object.entries(VIGENCIAS_AVISO).map(([id, { nombre }]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="aviso-acciones">
        <button type="button" className="btn secundario" onClick={salir}>Cancelar</button>
        <button className="btn">Ver vista previa</button>
      </div>
    </form>
  );
}

function RegistroAviso({ aviso, editar, retirado }) {
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function retirar() {
    setGuardando(true);
    setError('');
    try {
      await retirarAviso(aviso.id);
      setConfirmar(false);
      retirado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <article className="card aviso-registro">
      <div className="aviso-registro-superior">
        <EtiquetaAviso aviso={aviso} />
        <span className={`aviso-estado aviso-estado-${aviso.estado}`}>{ESTADOS_AVISO[aviso.estado]}</span>
      </div>
      <h3 className="pub-titulo">{aviso.titulo}</h3>
      <p className="aviso-mensaje">{aviso.mensaje}</p>
      <dl className="aviso-registro-datos">
        <div><dt>Destinatario</dt><dd>{destinatario(aviso.equipo)}</dd></div>
        <div><dt>Autor</dt><dd>{aviso.autor}</dd></div>
        <div><dt>Publicación</dt><dd>{fechaAviso(aviso.publicado_en)}</dd></div>
        <div><dt>Vencimiento</dt><dd>{aviso.vence_en ? fechaAviso(aviso.vence_en) : 'Retiro manual'}</dd></div>
        {aviso.modificado_en && <div><dt>Última modificación</dt><dd>{fechaAviso(aviso.modificado_en)}</dd></div>}
        {aviso.retirado_en && <div><dt>Retiro</dt><dd>{fechaAviso(aviso.retirado_en)}</dd></div>}
      </dl>
      {error && <p className="error" role="alert">{error}</p>}
      {confirmar && <p className="aviso-meta">El aviso saldrá de Inicio y Noticias y quedará en el historial.</p>}
      <div className="aviso-acciones">
        {aviso.estado !== 'retirado' && !confirmar && <button className="btn secundario chico" onClick={() => editar(aviso)}>Editar</button>}
        {aviso.estado === 'vigente' && !confirmar && <button className="btn secundario chico" onClick={() => setConfirmar(true)}>Retirar</button>}
        {confirmar && <button className="btn secundario chico" onClick={() => setConfirmar(false)} disabled={guardando}>Cancelar</button>}
        {confirmar && <button className="btn chico" onClick={retirar} disabled={guardando}>{guardando ? 'Retirando…' : 'Confirmar retiro'}</button>}
      </div>
    </article>
  );
}

function HistorialAvisos() {
  const { esDemo } = useSesion();
  const { recargar } = useAvisos();
  const [historial, setHistorial] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState(null);
  const [estado, setEstado] = useState({ cargando: true, error: '' });
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    let activo = true;
    const cargar = async () => {
      try {
        const datos = await cargarHistorial(filtro);
        if (activo) {
          setHistorial(datos);
          setEstado({ cargando: false, error: '' });
        }
      } catch (error) {
        if (activo) {
          setHistorial(null);
          setEstado({ cargando: false, error: error.message });
        }
      }
    };
    cargar();
    const intervalo = window.setInterval(() => { if (!document.hidden) cargar(); }, 30000);
    return () => { activo = false; window.clearInterval(intervalo); };
  }, [filtro, revision]);

  function actualizar(texto) {
    setEditor(null);
    setMensaje(texto);
    setRevision((n) => n + 1);
    recargar();
  }

  function abrirEditor(aviso) {
    setEditor({ aviso });
    setMensaje('');
    window.scrollTo(0, 0);
  }

  return (
    <>
      <Link to="/noticias?tab=aviso" className="volver">← Avisos de Noticias</Link>
      <h1 className="titulo display">Gestionar avisos</h1>
      {esDemo && <p className="subtitulo">Modo demostración · los avisos de prueba se reinician al recargar.</p>}
      {mensaje && <p className="exito" role="status">{mensaje}</p>}
      {editor ? (
        <EditorAviso aviso={editor.aviso} planteles={historial?.planteles ?? []} salir={() => setEditor(null)} guardado={actualizar} />
      ) : (
        <>
          {historial && <button className="btn aviso-nuevo" onClick={() => abrirEditor(null)}>Nuevo aviso</button>}
          <h2 className="nota-titulo">Historial de avisos</h2>
          <label htmlFor="aviso-filtro">Filtrar por estado</label>
          <select id="aviso-filtro" className="aviso-filtro" value={filtro} onChange={(e) => {
            setEstado({ cargando: true, error: '' });
            setFiltro(e.target.value);
          }}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADOS_AVISO).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
          {estado.cargando ? <p className="vacio suelto" role="status">Cargando historial…</p>
            : historial?.avisos.map((aviso) => <RegistroAviso key={aviso.id} aviso={aviso} editar={abrirEditor} retirado={() => actualizar('Aviso retirado.')} />)}
          {estado.error && <div className="card">
            <p className="error" role="alert">{estado.error}</p>
            <button className="btn secundario chico" onClick={() => setRevision((n) => n + 1)}>Reintentar</button>
          </div>}
          {!estado.cargando && historial?.avisos.length === 0 && <p className="vacio suelto">No hay avisos con este filtro.</p>}
        </>
      )}
    </>
  );
}

export default function GestionarAvisos() {
  const gestiona = useGestionaAvisos();
  return gestiona ? <HistorialAvisos /> : (
    <>
      <Link to="/noticias?tab=aviso" className="volver">← Avisos de Noticias</Link>
      <p className="vacio suelto">Solo Comunicaciones puede gestionar avisos.</p>
    </>
  );
}
