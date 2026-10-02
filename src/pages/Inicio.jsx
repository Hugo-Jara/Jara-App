import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { useInicio } from '../lib/inicio.js';
import { useListas, porEstado, sinResponder } from '../lib/listas.js';
import { useNoticias, TIPOS } from '../lib/noticias.js';
import Icono from '../components/Icono.jsx';

function ProximoPartido({ partido, miRespuesta, responder }) {
  if (!partido) {
    return (
      <section className="card accion">
        <div className="sobretitulo">Tu próximo partido</div>
        <p className="vacio">Todavía no hay un partido programado para tu equipo.</p>
      </section>
    );
  }
  const texto = { voy: 'Confirmaste que vas.', duda: 'Quedaste en duda.', baja: 'Avisaste que no vas.' };
  return (
    <section className="card accion destacada">
      <div className="sobretitulo">Tu próximo partido · {partido.equipo}</div>
      <h2 className="accion-titulo display">vs {partido.rival}</h2>
      <p className="accion-dato">{partido.fecha} · citación {partido.citacion}</p>
      <p className="accion-dato tenue">{partido.cancha}{partido.tercerTiempo ? ` · ${partido.tercerTiempo}` : ''}</p>
      {miRespuesta ? (
        <p className="respuesta" role="status">
          {texto[miRespuesta.estado]} <Link className="enlace" to="/partidos">Cambiar</Link>
        </p>
      ) : (
        <div className="botones">
          <button className="btn" onClick={() => responder({ estado: 'voy', asado: !!partido.tercerTiempo })}>Voy</button>
          <button className="btn secundario" onClick={() => responder({ estado: 'baja' })}>No puedo</button>
        </div>
      )}
      <p className="conteo">
        {porEstado(partido, 'voy').length} van, {porEstado(partido, 'duda').length} en duda, {sinResponder(partido).length} sin responder.{' '}
        <Link className="enlace" to="/partidos">Ver la lista</Link>
      </p>
    </section>
  );
}

function Entrenamiento({ entrenamiento, inscrito, inscribirme }) {
  if (!entrenamiento) {
    return (
      <section className="card accion">
        <div className="sobretitulo">Entrenamiento</div>
        <p className="vacio">No hay entrenamientos abiertos por ahora.</p>
      </section>
    );
  }
  const libres = entrenamiento.cupo - entrenamiento.inscritos.length;
  return (
    <section className="card accion">
      <div className="sobretitulo">Entrenamiento</div>
      <h2 className="accion-titulo">{entrenamiento.fecha} · {entrenamiento.hora}</h2>
      <p className="accion-dato tenue">{entrenamiento.lugar}</p>
      {inscrito ? (
        <p className="respuesta" role="status">
          Estás inscrito. <Link className="enlace" to="/entrenar">Ver la lista</Link>
        </p>
      ) : (
        <div className="botones">
          <button className="btn" onClick={inscribirme} disabled={libres <= 0}>Me inscribo</button>
        </div>
      )}
      <p className="conteo">
        {entrenamiento.inscritos.length} inscritos, quedan {libres} cupos.{' '}
        {!inscrito && <Link className="enlace" to="/entrenar">Ver la lista</Link>}
      </p>
    </section>
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
  const listas = useListas(nombre);
  return (
    <>
      <h1 className="titulo display">Hola, {nombre}</h1>
      <p className="subtitulo">Esto es lo que viene en el Jara.</p>
      <ProximoPartido partido={listas.partido} miRespuesta={listas.miRespuesta} responder={listas.responder} />
      <Entrenamiento entrenamiento={listas.entrenamiento} inscrito={listas.inscrito} inscribirme={listas.inscribirme} />
      <UltimoPartido partido={ultimoPartido} />
      <Noticias noticias={noticias} />
    </>
  );
}
