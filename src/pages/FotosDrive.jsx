import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { usePartidos } from '../lib/partidos.js';
import { useEnlacesFotos, buscarCarpetas, puedeBuscar } from '../lib/fotos.js';
import { RAIZ_FOTOS_LIGA, idDeCarpeta, linkCarpeta, proponer } from '../lib/fotosDrive.js';
import { fechaLarga, hoyIso } from '../lib/fechas.js';
import { plural } from '../lib/texto.js';

const GUARDADA = 'jara.fotos.raiz';
const leerRaiz = () => { try { return localStorage.getItem(GUARDADA) || RAIZ_FOTOS_LIGA; } catch { return RAIZ_FOTOS_LIGA; } };
const guardarRaiz = (id) => { try { localStorage.setItem(GUARDADA, id); } catch { /* sin almacenamiento, no pasa nada */ } };

const nombrePartido = (p) => `${p.equipo} vs ${p.rival} · ${fechaLarga(p.fecha)}`;

// Una carpeta encontrada, con el partido propuesto (o para elegir uno).
function Carpeta({ carpeta, propuesto, partidos, enlazar }) {
  const [elegido, setElegido] = useState(propuesto?.id ?? '');
  const [estado, setEstado] = useState({ guardando: false, error: '' });
  const confirmar = async () => {
    setEstado({ guardando: true, error: '' });
    try { await enlazar(elegido, carpeta.id, carpeta.nombre); }
    catch (x) { setEstado({ guardando: false, error: x.message }); }
  };
  return (
    <div className="fotos-carpeta">
      <div className="fotos-carpeta-nombre">
        <a className="enlace" href={linkCarpeta(carpeta.id)} target="_blank" rel="noreferrer">{carpeta.nombre}</a>
      </div>
      <div className="fotos-carpeta-dato">
        {[carpeta.ruta.join(' · '), carpeta.dia ? `fotos del ${fechaLarga(carpeta.dia)}` : 'sin fecha en las fotos',
          carpeta.fotos != null ? plural(carpeta.fotos, 'foto', 'fotos') : null].filter(Boolean).join(' · ')}
      </div>
      <label className="campo-etiqueta" htmlFor={`fc-${carpeta.id}`}>{propuesto ? 'Creemos que es este partido' : 'No encontramos el partido; elígelo si está'}</label>
      <select id={`fc-${carpeta.id}`} value={elegido} onChange={(e) => setElegido(e.target.value)}>
        <option value="">Ninguno</option>
        {partidos.map((p) => <option key={p.id} value={p.id}>{nombrePartido(p)}</option>)}
      </select>
      {estado.error && <p className="error" role="alert">{estado.error}</p>}
      <button className="btn chico" style={{ marginTop: 10 }} disabled={!elegido || estado.guardando} onClick={confirmar}>
        {estado.guardando ? 'Enlazando…' : 'Enlazar'}
      </button>
    </div>
  );
}

// Busca en el Drive de la liga las carpetas de los partidos del club y propone
// a qué partido corresponde cada una. Una persona confirma.
export default function FotosDrive() {
  const { persona } = useSesion();
  const { todos, cargando: cargandoPartidos } = usePartidos(persona);
  const { enlaces, enlazar, desenlazar, cargando, error } = useEnlacesFotos();
  const [raiz, setRaiz] = useState(leerRaiz);
  const [busqueda, setBusqueda] = useState({ estado: 'nada', carpetas: [], avance: null, error: '' });

  const hoy = hoyIso();
  // Solo partidos ya jugados y de planteles que yo puedo editar.
  const jugados = todos.filter((p) => p.fecha <= hoy && p.puedoEditar).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const id = idDeCarpeta(raiz);

  const buscar = async (e) => {
    e.preventDefault();
    if (!id) { setBusqueda({ estado: 'nada', carpetas: [], avance: null, error: 'Ese link no parece una carpeta del Drive.' }); return; }
    guardarRaiz(raiz.trim());
    setBusqueda({ estado: 'buscando', carpetas: [], avance: null, error: '' });
    try {
      const carpetas = await buscarCarpetas(id, (avance) => setBusqueda((b) => ({ ...b, avance })));
      setBusqueda({ estado: 'listo', carpetas, avance: null, error: '' });
    } catch (x) {
      setBusqueda({ estado: 'nada', carpetas: [], avance: null, error: x.message });
    }
  };

  const { propuestas, sinPartido } = proponer(busqueda.carpetas, jugados, enlaces);
  const libres = jugados.filter((p) => !enlaces.some((e) => e.partidoId === p.id));
  const enlazados = enlaces
    .map((e) => ({ ...e, partido: todos.find((p) => p.id === e.partidoId) }))
    .filter((e) => e.partido)
    .sort((a, b) => b.partido.fecha.localeCompare(a.partido.fecha));

  return (
    <>
      <Link to="/mas" className="volver">‹ Más</Link>
      <h1 className="titulo display">Fotos de los partidos</h1>
      <p className="subtitulo">Busca en el Drive del fotógrafo las carpetas de nuestros partidos y enlázalas. Las fotos no se copian: se ven desde el Drive.</p>

      <form className="card" onSubmit={buscar}>
        <label className="campo-etiqueta" htmlFor="fd-raiz">Carpeta del Drive donde están las fotos</label>
        <input id="fd-raiz" value={raiz} onChange={(e) => setRaiz(e.target.value)} placeholder="Pega el link de la carpeta" />
        {!puedeBuscar && (
          <p className="nota" style={{ textAlign: 'left' }}>
            Falta la llave de Google para leer el Drive. Mientras tanto, puedes pegar el link de la carpeta en cada partido.
          </p>
        )}
        {busqueda.error && <p className="error" role="alert">{busqueda.error}</p>}
        <button className="btn" style={{ marginTop: 12 }} disabled={!puedeBuscar || busqueda.estado === 'buscando' || cargandoPartidos}>
          {busqueda.estado === 'buscando'
            ? `Buscando… ${busqueda.avance ? `${plural(busqueda.avance.revisadas, 'carpeta revisada', 'carpetas revisadas')}, ${busqueda.avance.encontradas} nuestras` : ''}`
            : 'Buscar carpetas'}
        </button>
      </form>

      {busqueda.estado === 'listo' && (
        <section className="grupo">
          <div className="sobretitulo">Encontradas</div>
          {propuestas.length === 0 && sinPartido.length === 0 && (
            <p className="vacio">No hay carpetas nuevas: todas las que encontramos ya están enlazadas.</p>
          )}
          {propuestas.map(({ carpeta, partido }) => (
            <Carpeta key={carpeta.id} carpeta={carpeta} propuesto={partido} partidos={libres} enlazar={enlazar} />
          ))}
          {sinPartido.map((c) => (
            <Carpeta key={c.id} carpeta={c} propuesto={null} partidos={libres} enlazar={enlazar} />
          ))}
        </section>
      )}

      <section className="grupo">
        <div className="sobretitulo">Ya enlazadas</div>
        {cargando && <p className="vacio">Cargando…</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {!cargando && !enlazados.length && <p className="vacio">Todavía no hay partidos con fotos.</p>}
        {enlazados.map((e) => (
          <div key={e.partidoId} className="fotos-carpeta">
            <div className="fotos-carpeta-nombre"><Link className="enlace" to={`/partidos/${e.partidoId}`}>{nombrePartido(e.partido)}</Link></div>
            <div className="fotos-carpeta-dato">
              <a className="enlace" href={linkCarpeta(e.carpetaId)} target="_blank" rel="noreferrer">{e.carpetaNombre || 'Carpeta del Drive'}</a>
              {e.puedoCambiar && <> · <button className="enlace quitar" onClick={() => desenlazar(e.partidoId)}>Quitar</button></>}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
