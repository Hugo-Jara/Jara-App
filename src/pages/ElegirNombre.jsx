import { useEffect, useState } from 'react';
import { useSesion } from '../lib/sesion.jsx';
import { buscarEnNomina, pedirIngreso, miSolicitud, cancelarSolicitud } from '../lib/ingreso.js';
import { equiposDelClub } from '../lib/partidos.js';
import { ESCUDO, BASE } from '../lib/base.js';

// Primera vez que alguien entra: su cuenta todavía no es nadie en el club.
// Busca su nombre en la nómina, pide entrar y espera a que lo aprueben.

function Buscar({ alPedir }) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState(null);
  const [elegida, setElegida] = useState(null);
  const [fuera, setFuera] = useState(false);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // Busca al dejar de escribir, desde la tercera letra.
  useEffect(() => {
    if (texto.trim().length < 3) { setResultados(null); return undefined; }
    let vigente = true;
    const espera = setTimeout(() => {
      buscarEnNomina(texto).then((r) => vigente && setResultados(r), (e) => vigente && setError(e.message));
    }, 300);
    return () => { vigente = false; clearTimeout(espera); };
  }, [texto]);

  const pedir = async (datos) => {
    setError(''); setOcupado(true);
    try { await pedirIngreso(datos); await alPedir(); } catch (e) { setError(e.message); setOcupado(false); }
  };

  if (fuera) return <FueraDeLaLista inicial={texto} ocupado={ocupado} error={error} onPedir={pedir} onVolver={() => setFuera(false)} />;

  if (elegida) {
    return (
      <div className="card">
        <div className="sobretitulo">¿Eres tú?</div>
        <h2 className="accion-titulo">{elegida.nombre}</h2>
        <p className="accion-dato tenue">{elegida.equipos.join(' · ') || 'Sin plantel asignado'}</p>
        <p className="ayuda abajo">Un encargado de tu plantel tiene que confirmar que eres tú antes de que puedas entrar.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="botones">
          <button className="btn" disabled={ocupado} onClick={() => pedir({ personaId: elegida.id })}>
            {ocupado ? 'Enviando…' : 'Sí, pedir ingreso'}
          </button>
          <button className="btn secundario" disabled={ocupado} onClick={() => setElegida(null)}>No soy yo</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <label htmlFor="busca" style={{ marginTop: 0 }}>Escribe tu nombre o tu apellido</label>
      <input id="busca" value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off"
             placeholder="Al menos tres letras" />
      {resultados && resultados.length > 0 && (
        <ul className="opciones" aria-label="Nombres encontrados">
          {resultados.map((r) => (
            <li key={r.id}>
              <button className="opcion" onClick={() => setElegida(r)}>
                <span className="opcion-nombre">{r.nombre}</span>
                <span className="opcion-detalle">{r.equipos.join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {resultados && resultados.length === 0 && (
        <p className="ayuda abajo" role="status">
          No hay nadie con ese nombre esperando cuenta. Prueba solo con tu apellido, o como te anota tu tesorero.
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="ayuda abajo">
        <button className="enlace" onClick={() => { setError(''); setFuera(true); }}>No aparezco en la lista</button>
      </p>
    </div>
  );
}

function FueraDeLaLista({ inicial, ocupado, error, onPedir, onVolver }) {
  const [nombre, setNombre] = useState(inicial);
  const [equipos, setEquipos] = useState([]);
  const [mios, setMios] = useState([]);
  useEffect(() => { equiposDelClub().then(setEquipos, () => {}); }, []);
  const alternar = (id) => setMios(mios.includes(id) ? mios.filter((x) => x !== id) : [...mios, id]);

  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); onPedir({ nombre: nombre.trim(), equipos: mios }); }}>
      <div className="sobretitulo">No aparezco en la lista</div>
      <label htmlFor="nombre-nuevo">Tu nombre y apellido</label>
      <input id="nombre-nuevo" required minLength={3} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
      <fieldset className="bloque">
        <legend>¿En qué plantel juegas?</legend>
        <p className="ayuda">Marca todos los que correspondan. Si no juegas, déjalos sin marcar.</p>
        {equipos.map((eq) => (
          <label key={eq.id} className="casilla">
            <input type="checkbox" checked={mios.includes(eq.id)} onChange={() => alternar(eq.id)} />
            {eq.nombre}
          </label>
        ))}
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="botones">
        <button className="btn" disabled={ocupado}>{ocupado ? 'Enviando…' : 'Pedir ingreso'}</button>
        <button type="button" className="btn secundario" disabled={ocupado} onClick={onVolver}>Volver a buscar</button>
      </div>
    </form>
  );
}

function EnEspera({ solicitud, alCambiar }) {
  const { recargarPersona } = useSesion();
  const [revisando, setRevisando] = useState(false);
  const [aviso, setAviso] = useState('');
  const url = `${window.location.origin}${BASE}ingresos`;
  const mensaje = `Hola, pedí entrar a la Jara App como ${solicitud.nombre}. ¿Me das el pase? 👉 ${url}`;

  const revisar = async () => {
    setRevisando(true); setAviso('');
    await recargarPersona();
    // Si ya lo aprobaron, la app cambia sola de pantalla; si sigue acá, falta.
    await alCambiar();
    setAviso('Todavía no te aprueban.');
    setRevisando(false);
  };

  return (
    <div className="card">
      <div className="sobretitulo">Solicitud enviada</div>
      <h2 className="accion-titulo">{solicitud.nombre}</h2>
      {solicitud.equipos.length > 0 && <p className="accion-dato tenue">{solicitud.equipos.join(' · ')}</p>}
      <p className="respuesta" role="status">
        Falta que te den el pase.
        {solicitud.aprueban.length > 0 && <> Lo puede hacer {solicitud.aprueban.join(', ')}.</>}
      </p>
      <a className="btn" style={{ marginTop: 16 }} target="_blank" rel="noopener noreferrer"
         href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}>
        Avisar por WhatsApp
      </a>
      <div className="botones">
        <button className="btn secundario" disabled={revisando} onClick={revisar}>
          {revisando ? 'Revisando…' : 'Ya me aprobaron'}
        </button>
      </div>
      {aviso && <p className="ayuda abajo" role="status">{aviso}</p>}
      <p className="ayuda abajo">
        <button className="enlace" onClick={async () => { await cancelarSolicitud(); await alCambiar(); }}>
          Me equivoqué de nombre
        </button>
      </p>
    </div>
  );
}

export default function ElegirNombre() {
  const { sesion, salir } = useSesion();
  const [solicitud, setSolicitud] = useState(undefined);
  const cargar = async () => {
    try { setSolicitud(await miSolicitud()); } catch { setSolicitud({ estado: 'sin_solicitud' }); }
  };
  useEffect(() => { cargar(); }, []);

  if (solicitud === undefined) return <div className="cargando">Cargando…</div>;
  const rechazada = solicitud.estado === 'rechazada';
  return (
    <div className="ingreso">
      <img className="escudo" src={ESCUDO} alt="Escudo del Club Hugo Jara" />
      <h1 className="titulo display">{solicitud.estado === 'pendiente' ? 'Casi listo' : '¿Quién eres?'}</h1>
      <p className="subtitulo">
        Entraste con <strong>{sesion?.user?.email}</strong>.{' '}
        {solicitud.estado === 'pendiente'
          ? 'Apenas te aprueben vas a ver tus partidos y entrenamientos.'
          : 'Busca tu nombre en la nómina del club para ver tus partidos y entrenamientos.'}
      </p>
      {rechazada && (
        <p className="item-comentario" role="status" style={{ marginBottom: 14 }}>
          No aprobaron tu solicitud como {solicitud.nombre}. Si fue un error, vuelve a pedirla y avísale a tu encargado.
        </p>
      )}
      {solicitud.estado === 'pendiente'
        ? <EnEspera solicitud={solicitud} alCambiar={cargar} />
        : <Buscar alPedir={cargar} />}
      <button className="btn secundario" onClick={salir}>Entrar con otra cuenta</button>
    </div>
  );
}
