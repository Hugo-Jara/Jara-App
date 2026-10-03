import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { useInicio } from '../lib/inicio.js';
import { usePartidos, porEstado, sinResponder } from '../lib/partidos.js';
import { useEntrenamiento, horario } from '../lib/entrenamiento.js';
import { useSolicitudes } from '../lib/ingreso.js';
import { useNoticias, TIPOS } from '../lib/noticias.js';
import { fechaLarga } from '../lib/fechas.js';
import { pesos } from '../lib/pedido.js';
import { plural } from '../lib/texto.js';
import Icono from '../components/Icono.jsx';

const TEXTO_RESPUESTA = { voy: 'Confirmaste que vas.', duda: 'Quedaste en duda.', baja: 'Avisaste que no vas.' };

// Una tarjeta por cada partido que le toca: quien juega en dos planteles ve los dos.
function ProximoPartido({ partido, destacado, responder }) {
  const [error, setError] = useState('');
  const rapido = async (respuesta) => {
    setError('');
    try { await responder(partido.id, respuesta); } catch (e) { setError(e.message); }
  };
  return (
    <section className={`card accion ${destacado ? 'destacada' : ''}`}>
      <div className="sobretitulo">Tu próximo partido · {partido.equipo}</div>
      <h2 className="accion-titulo display">vs {partido.rival}</h2>
      <p className="accion-dato">{fechaLarga(partido.fecha)}{partido.citacion ? ` · citación ${partido.citacion}` : ''}</p>
      <p className="accion-dato tenue">{[partido.cancha, partido.tercerTiempo].filter(Boolean).join(' · ')}</p>
      {partido.miRespuesta ? (
        <p className="respuesta" role="status">
          {TEXTO_RESPUESTA[partido.miRespuesta.estado]} <Link className="enlace" to={`/partidos/${partido.id}`}>Cambiar</Link>
        </p>
      ) : (
        <div className="botones">
          <button className="btn" onClick={() => rapido({ estado: 'voy', asado: !!partido.tercerTiempo })}>Voy</button>
          <button className="btn secundario" onClick={() => rapido({ estado: 'baja' })}>No puedo</button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="conteo">
        {porEstado(partido, 'voy').length} van, {porEstado(partido, 'duda').length} en duda, {sinResponder(partido).length} sin responder.{' '}
        <Link className="enlace" to={`/partidos/${partido.id}`}>Ver la lista</Link>
      </p>
    </section>
  );
}

function SinPartido({ equipos }) {
  return (
    <section className="card accion">
      <div className="sobretitulo">Tu próximo partido</div>
      <p className="vacio">
        {equipos.length
          ? `Todavía no hay un partido programado para ${equipos.map((e) => e.nombre).join(' ni ')}.`
          : 'No estás en ningún plantel, así que no tienes partidos por confirmar.'}{' '}
        <Link className="enlace" to="/partidos">Ver los partidos del club</Link>
      </p>
    </section>
  );
}

function Entrenamiento({ e, miInscripcion, libres, inscribirme }) {
  const [error, setError] = useState('');
  if (!e) {
    return (
      <section className="card accion">
        <div className="sobretitulo">Entrenamiento</div>
        <p className="vacio">No hay entrenamientos abiertos por ahora.</p>
      </section>
    );
  }
  return (
    <section className="card accion">
      <div className="sobretitulo">Entrenamiento</div>
      <h2 className="accion-titulo">{fechaLarga(e.fecha)}{horario(e) ? ` · ${horario(e)}` : ''}</h2>
      <p className="accion-dato tenue">{e.lugar}</p>
      {miInscripcion ? (
        <p className="respuesta" role="status">
          Estás inscrito. <Link className="enlace" to="/entrenar">Ver la lista</Link>
        </p>
      ) : (
        <div className="botones">
          <button className="btn" disabled={libres <= 0}
                  onClick={() => { setError(''); inscribirme().catch((x) => setError(x.message)); }}>
            {libres > 0 ? `Me inscribo · ${pesos(e.miPrecio)}` : 'Lista completa'}
          </button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="conteo">
        {plural(e.inscritos.length, 'inscrito', 'inscritos')}, {libres === 1 ? 'queda 1 cupo' : `quedan ${libres} cupos`}.{' '}
        {!miInscripcion && <Link className="enlace" to="/entrenar">Ver la lista</Link>}
      </p>
    </section>
  );
}

// Solo para encargados: gente que pidió entrar y espera su pase.
function PasesPendientes() {
  const { solicitudes } = useSolicitudes();
  if (!solicitudes.length) return null;
  return (
    <Link to="/ingresos" className="card accion aviso">
      <div className="sobretitulo">Te toca aprobar</div>
      <p className="accion-dato">
        {solicitudes.length === 1 ? '1 persona pidió entrar a la app.' : `${solicitudes.length} personas pidieron entrar a la app.`}
      </p>
      <span className="ver-mas">Revisar <Icono nombre="flecha" size={16} /></span>
    </Link>
  );
}

function UltimoPartido({ partido }) {
  if (!partido) {
    return (
      <section className="card accion">
        <div className="sobretitulo">Tu último partido</div>
        <p className="vacio">Cuando se juegue el primer partido, acá van a estar el resultado y las fotos.</p>
      </section>
    );
  }
  const resultado =
    partido.golesFavor > partido.golesContra ? 'Ganamos' :
    partido.golesFavor < partido.golesContra ? 'Perdimos' : 'Empatamos';
  const visibles = Math.min(partido.fotos, 4);
  return (
    <Link to="/partidos" className="card accion">
      <div className="sobretitulo">Tu último partido · {partido.cuando}</div>
      <div className="marcador">
        <span className="marcador-goles display">{partido.golesFavor} – {partido.golesContra}</span>
        <span className="marcador-texto">{resultado} contra {partido.rival}</span>
      </div>
      <div className="fotos" aria-hidden="true">
        {Array.from({ length: visibles }, (_, i) => (
          <div key={i} className={`foto foto-${i}`}>
            {i === visibles - 1 && partido.fotos > visibles && <span>+{partido.fotos - visibles}</span>}
          </div>
        ))}
      </div>
      <span className="ver-mas">Ver las {partido.fotos} fotos y el resumen <Icono nombre="flecha" size={16} /></span>
    </Link>
  );
}

function Noticias({ noticias }) {
  return (
    <>
      <div className="seccion-fila">
        <h2 className="seccion">Noticias del Jara</h2>
        {noticias.length > 0 && <Link to="/noticias" className="enlace">Ver todas</Link>}
      </div>
      {noticias.length === 0 ? (
        <p className="vacio suelto">Acá va a aparecer el boletín del club.</p>
      ) : (
        <div className="card lista">
          {noticias.map((n) => (
            <Link key={n.id} to={`/noticias/${n.id}`} className="noticia">
              <div className="noticia-fecha">{TIPOS[n.tipo]} · {n.fecha}</div>
              <div className="noticia-titulo">{n.titulo}</div>
              <div className="noticia-bajada">{n.bajada}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function Inicio() {
  const { persona } = useSesion();
  const { ultimoPartido } = useInicio();
  const noticias = useNoticias().publicaciones.slice(0, 3);
  const nombre = persona.nombre.split(' ')[0];
  const partidos = usePartidos(persona);
  const entreno = useEntrenamiento(persona);
  return (
    <>
      <h1 className="titulo display">Hola, {nombre}</h1>
      <p className="subtitulo">Esto es lo que viene en el Jara.</p>
      {persona.esEncargado && <PasesPendientes />}
      {partidos.cargando
        ? <section className="card accion"><p className="vacio">Cargando tus partidos…</p></section>
        : partidos.mios.length
          ? partidos.mios.map((p, i) => <ProximoPartido key={p.id} partido={p} destacado={i === 0} responder={partidos.responder} />)
          : <SinPartido equipos={persona.equipos} />}
      {!entreno.cargando && (
        <Entrenamiento e={entreno.entrenamiento} miInscripcion={entreno.miInscripcion} libres={entreno.libres} inscribirme={entreno.inscribirme} />
      )}
      <UltimoPartido partido={ultimoPartido} />
      <Noticias noticias={noticias} />
    </>
  );
}
