import { TarjetaReal } from '../components/boletin/BoletinReal.jsx';
import { ultimaEdicion } from '../lib/boletin.js';
import { yaLeida, marcarLeida } from '../lib/boletinLeido.js';
import { esDemo } from '../lib/supabase.js';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { useInicio } from '../lib/inicio.js';
import { usePartidos, porEstado, sinResponder, tieneResultado } from '../lib/partidos.js';
import { revisarLiga } from '../lib/liga.js';
import { useEntrenamiento, horario } from '../lib/entrenamiento.js';
import { useSolicitudes, usePuedeAprobarIngresos } from '../lib/ingreso.js';
import { useNoticias, TIPOS } from '../lib/noticias.js';
import { fechaLarga } from '../lib/fechas.js';
import { pesos } from '../lib/pedido.js';
import { plural } from '../lib/texto.js';
import Icono from '../components/Icono.jsx';
import { useHonorariosPorPagar, desglose, nombreMes } from '../lib/fondo.js';
import Bienvenida from '../components/Bienvenida.jsx';
import { useApodos } from '../lib/apodos.js';
import SubirFiesta from '../components/SubirFiesta.jsx';
import BotonDocumental from '../components/BotonDocumental.jsx';
import { useFiesta, fiestaVisible } from '../lib/fiesta.js';
import { Miniatura } from './Fiesta20.jsx';

// Temporal: fotos y videos del carrete de los 20 años (se apaga en src/lib/fiesta.js).
function Fiesta20() {
  const { datos, recargar } = useFiesta();
  const navegar = useNavigate();
  const archivos = datos?.archivos ?? [];
  return (
    <section className="card accion fiesta-tarjeta">
      <div className="sobretitulo">20 años del Jara</div>
      <h2 className="accion-titulo display">Sube tus fotos del carrete</h2>
      <p className="accion-dato tenue">Fotos y videos de la fiesta de los 20 años, para que todos los vean. Puedes elegir varios a la vez.</p>
      {archivos.length > 0 && (
        <div className="fiesta-tira">
          {archivos.slice(0, 4).map((a) => <Miniatura key={a.id} a={a} abrir={() => navegar('/fiesta-20')} />)}
        </div>
      )}
      <SubirFiesta listo={recargar} />
      <BotonDocumental />
      <Link to="/fiesta-20" className="ver-mas" style={{ marginTop: 14 }}>
        {archivos.length ? `Ver la galería (${archivos.length})` : 'Ver la galería'} <Icono nombre="flecha" size={16} />
      </Link>
    </section>
  );
}

const TEXTO_RESPUESTA = { voy: 'Confirmaste que vas.', duda: 'Quedaste en duda.', baja: 'Avisaste que no vas.' };

// Una tarjeta por cada partido que le toca: quien juega en dos planteles ve los dos.
function ProximoPartido({ partido, destacado, responder }) {
  const [error, setError] = useState('');
  const navegar = useNavigate();
  const rapido = async (respuesta) => {
    setError('');
    try { await responder(partido.id, respuesta); } catch (e) { setError(e.message); }
  };
  // Toda la tarjeta abre el partido, como las listas. Los botones Voy / Duda /
  // No voy y los enlaces de adentro siguen haciendo lo suyo sin abrirlo.
  const abrir = (e) => {
    if (e.target.closest('button, a, input, select, textarea')) return;
    navegar(`/partidos/${partido.id}`);
  };
  return (
    <section className={`card accion tocable ${destacado ? 'destacada' : ''}`} onClick={abrir}>
      <div className="sobretitulo">Tu próximo partido · {partido.equipo}</div>
      <h2 className="accion-titulo display">
        <Link to={`/partidos/${partido.id}`} className="tarjeta-enlace">vs {partido.rival}</Link>
      </h2>
      <p className="accion-dato">{fechaLarga(partido.fecha)}{partido.citacion ? ` · citación ${partido.citacion}` : ''}{partido.horaInicio ? ` · parte ${partido.horaInicio}` : ''}</p>
      <p className="accion-dato tenue">{[partido.cancha, partido.tercerTiempo].filter(Boolean).join(' · ')}</p>
      {partido.miRespuesta ? (
        <p className="respuesta" role="status">
          {TEXTO_RESPUESTA[partido.miRespuesta.estado]} <Link className="enlace" to={`/partidos/${partido.id}`}>Cambiar</Link>
        </p>
      ) : (
        <div className="botones">
          <button className="btn" onClick={() => rapido({ estado: 'voy', asado: !!partido.tercerTiempo })}>Voy</button>
          <button className="btn secundario" onClick={() => rapido({ estado: 'duda' })}>Duda</button>
          <button className="btn secundario" onClick={() => rapido({ estado: 'baja' })}>No voy</button>
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

// Si no cargó, se dice eso, en vez de "no hay" (que sería falso).
function ErrorCarga({ titulo, error, recargar }) {
  return (
    <section className="card accion">
      <div className="sobretitulo">{titulo}</div>
      <p className="error" role="alert">{error}</p>
      <button className="btn chico secundario" onClick={recargar}>Reintentar</button>
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
          : 'Eres socio del club sin plantel, así que no tienes partidos por confirmar. Igual puedes inscribirte a los entrenamientos y seguir al club.'}{' '}
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

// Solo para quien aprueba pases (Tesorería, encargados y administradores): gente que pidió entrar.
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

// Solo para Hacienda: honorarios del entrenador que el equipo del fondo pidió pagar.
function HonorariosPorPagar({ persona }) {
  const lista = useHonorariosPorPagar(persona);
  if (!lista.length) return null;
  const total = lista.reduce((t, h) => t + desglose(h.monto).liquido, 0);
  return (
    <Link to="/fondo?v=honorarios" className="card accion aviso">
      <div className="sobretitulo">Te toca pagar</div>
      <p className="accion-dato">
        Honorarios del entrenador de {lista.map((h) => nombreMes(h.mes)).join(' y ')}: transferir {pesos(total)} líquidos
        desde la cuenta del club y subir el comprobante.
      </p>
      <span className="ver-mas">Ver la boleta y pagar <Icono nombre="flecha" size={16} /></span>
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
    <Link to={partido.id ? `/partidos/${partido.id}` : '/partidos'} className="card accion">
      <div className="sobretitulo">Tu último partido · {partido.cuando}</div>
      <div className="marcador">
        <span className="marcador-goles display">{partido.golesFavor} – {partido.golesContra}</span>
        <span className="marcador-texto">{resultado} contra {partido.rival}</span>
      </div>
      {partido.fotos > 0 && <div className="fotos" aria-hidden="true">
        {Array.from({ length: visibles }, (_, i) => (
          <div key={i} className={`foto foto-${i}`}>
            {i === visibles - 1 && partido.fotos > visibles && <span>+{partido.fotos - visibles}</span>}
          </div>
        ))}
      </div>}
      <span className="ver-mas">
        {partido.fotos > 0 ? `Ver las ${partido.fotos} fotos y el resumen` : 'Ver el partido'} <Icono nombre="flecha" size={16} />
      </span>
    </Link>
  );
}

function Noticias({ noticias }) {
  // Con la base real las noticias son el boletín, que tiene su propia tarjeta arriba.
  if (!esDemo && noticias.length === 0) return null;
  return (
    <>
      <div className="seccion-fila">
        <h2 className="seccion">Noticias del Jara</h2>
        {noticias.length > 0 && <Link to="/noticias" className="enlace">Ver todas</Link>}
      </div>
      {noticias.length === 0 ? (
        <p className="vacio suelto">Se viene El Jara Informa: el boletín del club llega a la app para la fiesta de los 20 años.</p>
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

// Solo el partido que viene de cada plantel propio (el de la fecha siguiente
// aparece cuando pasa este). Los demás están en La liga.
const siguientes = (mios) => {
  const vistos = new Set();
  return [...mios].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.horaInicio ?? '').localeCompare(b.horaInicio ?? ''))
    .filter((p) => !vistos.has(p.equipoId) && vistos.add(p.equipoId));
};

// El Jara Informa: la edición nueva va arriba de todo hasta que la persona la
// lee; después baja, bajo sus partidos y su entrenamiento (que son lo suyo).
function useBoletinInicio() {
  const [b, setB] = useState({ edicion: null, leida: false, error: '' });
  const cargar = async () => {
    try {
      const edicion = await ultimaEdicion();
      const leida = edicion ? await yaLeida(edicion.id) : false;
      setB({ edicion, leida, error: '' });
    } catch (e) { setB({ edicion: null, leida: false, error: e.message }); }
  };
  useEffect(() => { if (!esDemo) cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...b, cargar };
}

function BoletinInicio({ b }) {
  if (b.error) return <section className="card"><p role="alert">{b.error}</p><button className="btn secundario" onClick={b.cargar}>Reintentar boletín</button></section>;
  if (!b.edicion) return null;
  // Al tocar "Leer edición" queda leída (el lector también la marca).
  const alAbrir = (ev) => { if (ev.target.closest('a')) marcarLeida(b.edicion.id); };
  return <section className="card" onClickCapture={alAbrir}><TarjetaReal edicion={b.edicion} ultima /></section>;
}

export default function Inicio() {
  const { persona } = useSesion();
  const apruebaIngresos = usePuedeAprobarIngresos(persona);
  const { ultimoPartido: ejemplo } = useInicio();
  const noticias = useNoticias().publicaciones.slice(0, 3);
  // Si la persona eligió un apodo en su perfil, la saludamos con él; si no,
  // con su nombre. En el resto de la app se muestra Nombre + Apellido.
  // "el Checho" saluda "Hola, Checho": sin el artículo suena natural.
  const apodo = useApodos()[persona.id]?.replace(/^(el|la)\s+/i, '').trim();
  const nombre = apodo || persona.nombre.split(' ')[0];
  const partidos = usePartidos(persona);
  const entreno = useEntrenamiento(persona);
  const boletin = useBoletinInicio();
  // Los partidos del Jara se crean solos desde las fechas de la liga (0038):
  // al abrir la app se revisa (la base decide si ya toca, cada 3 horas).
  useEffect(() => { revisarLiga(partidos.recargar); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // El último partido con resultado anotado, de mis planteles primero; si no hay, el de ejemplo (demo).
  const real = partidos.jugados.filter(tieneResultado);
  const ultimo = real.find((p) => p.esMio) ?? real[0];
  const ultimoPartido = ultimo
    ? { id: ultimo.id, equipo: ultimo.equipo, rival: ultimo.rival, cuando: fechaLarga(ultimo.fecha),
        golesFavor: ultimo.golesFavor, golesContra: ultimo.golesContra, fotos: 0 }
    : ejemplo;
  return (
    <>
      <h1 className="titulo display">Hola, {nombre}</h1>
      <p className="subtitulo">Esto es lo que viene en el Jara.</p>
      <Bienvenida />
      {apruebaIngresos && <PasesPendientes />}
      <HonorariosPorPagar persona={persona} />
      {fiestaVisible() && <Fiesta20 />}
      {!boletin.leida && <BoletinInicio b={boletin} />}
      {partidos.cargando
        ? <section className="card accion"><p className="vacio">Cargando tus partidos…</p></section>
        : partidos.mios.length
          ? siguientes(partidos.mios).map((p, i) => <ProximoPartido key={p.id} partido={p} destacado={i === 0} responder={partidos.responder} />)
          : partidos.error
            ? <ErrorCarga titulo="Tu próximo partido" error={partidos.error} recargar={partidos.recargar} />
            : <SinPartido equipos={persona.equipos} />}
      {!entreno.cargando && (entreno.error && !entreno.entrenamiento
        ? <ErrorCarga titulo="Entrenamiento" error={entreno.error} recargar={entreno.recargar} />
        : <Entrenamiento e={entreno.entrenamiento} miInscripcion={entreno.miInscripcion} libres={entreno.libres} inscribirme={entreno.inscribirme} />
      )}
      <UltimoPartido partido={ultimoPartido} />
      {boletin.leida && <BoletinInicio b={boletin} />}
      <Noticias noticias={noticias} />
    </>
  );
}
