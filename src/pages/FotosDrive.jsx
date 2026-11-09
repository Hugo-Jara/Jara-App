import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { usePartidos, equiposDelClub, crearPartidoJugado } from '../lib/partidos.js';
import { useEnlacesFotos, carpetasDelDrive, revisarDrive } from '../lib/fotos.js';
import { RAIZ_FOTOS_LIGA, linkCarpeta, proponer, normalizar } from '../lib/fotosDrive.js';
import { fechaLarga, hoyIso } from '../lib/fechas.js';
import { plural } from '../lib/texto.js';

const nombrePartido = (p) => `${p.equipo} vs ${p.rival} · ${fechaLarga(p.fecha)}`;
// El plantel de una carpeta sin partido: Jr → Junior; Sr → el Senior que juega
// ese día de la semana (jueves o sábado).
export function plantelPara(carpeta, equipos) {
  const n = (e) => normalizar(e.nombre);
  const cat = equipos.filter((e) => (carpeta.categoria === 'jr' ? n(e).includes('junior')
    : carpeta.categoria === 'sr' ? n(e).includes('senior') : false));
  if (cat.length <= 1 || !carpeta.dia) return cat[0] ?? null;
  const dia = new Date(`${carpeta.dia}T12:00:00Z`).getUTCDay();
  return cat.find((e) => n(e).includes(dia === 4 ? 'jueves' : 'sabado')) ?? cat[0];
}

// Crea el partido que falta (ya jugado) con los datos de la carpeta y la enlaza.
async function crearYEnlazar(carpeta, equipo, enlazar) {
  const id = await crearPartidoJugado({
    equipoId: equipo.id, rival: (carpeta.rival || 'Rival').slice(0, 80), fecha: carpeta.dia,
    torneo: carpeta.ruta.join(' · ').slice(0, 80) || null,
  });
  await enlazar(id, carpeta.id, carpeta.nombre);
}

const hora = (iso) => new Date(iso).toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// Una carpeta sin partido, con el partido propuesto (o para elegir uno).
function Carpeta({ carpeta, propuesto, partidos, enlazar, equipo }) {
  const [elegido, setElegido] = useState(propuesto?.id ?? '');
  const [estado, setEstado] = useState({ guardando: false, error: '' });
  const confirmar = async () => {
    setEstado({ guardando: true, error: '' });
    try { await enlazar(elegido, carpeta.id, carpeta.nombre); }
    catch (x) { setEstado({ guardando: false, error: x.message }); }
  };
  const crear = async () => {
    setEstado({ guardando: true, error: '' });
    try { await crearYEnlazar(carpeta, equipo, enlazar); }
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
      <div className="fotos-carpeta-botones">
        <button className="btn chico" disabled={!elegido || estado.guardando} onClick={confirmar}>
          {estado.guardando ? 'Enlazando…' : 'Enlazar'}
        </button>
        {!propuesto && equipo && carpeta.dia && (
          <button className="btn secundario chico" disabled={estado.guardando} onClick={crear}>Crear el partido</button>
        )}
      </div>
      {!propuesto && equipo && carpeta.dia && (
        <p className="nota" style={{ textAlign: 'left', marginTop: 8 }}>
          "Crear el partido" lo agrega como jugado: {equipo.nombre} vs {carpeta.rival}, {fechaLarga(carpeta.dia)}.
        </p>
      )}
    </div>
  );
}

// Capitanes y administradores: las carpetas del Drive de la liga que son del
// club, cuáles se enlazaron solas y cuáles falta confirmar.
export default function FotosDrive() {
  const { persona } = useSesion();
  const { todos } = usePartidos(persona);
  const { enlaces, enlazar, desenlazar, recargar } = useEnlacesFotos();
  const [carpetas, setCarpetas] = useState(null);
  const [errorCarpetas, setErrorCarpetas] = useState('');
  const [busqueda, setBusqueda] = useState({ buscando: false, avance: null, resultado: null, error: '' });
  const [equipos, setEquipos] = useState([]);
  const [masivo, setMasivo] = useState({ creando: false, hechos: 0, error: '' });
  useEffect(() => { equiposDelClub().then(setEquipos, () => setEquipos([])); }, []);

  const cargarCarpetas = () => carpetasDelDrive().then((c) => { setCarpetas(c); setErrorCarpetas(''); }, (e) => setErrorCarpetas(e.message));
  useEffect(() => { cargarCarpetas(); }, [enlaces]);

  const buscar = async () => {
    setBusqueda({ buscando: true, avance: null, resultado: null, error: '' });
    try {
      const r = await revisarDrive(true, (avance) => setBusqueda((b) => ({ ...b, avance })));
      setBusqueda({ buscando: false, avance: null, resultado: r, error: '' });
      await recargar();
      await cargarCarpetas();
    } catch (x) { setBusqueda({ buscando: false, avance: null, resultado: null, error: x.message }); }
  };

  const hoy = hoyIso();
  // Solo partidos ya jugados de planteles que yo puedo editar.
  const jugados = todos.filter((p) => p.fecha <= hoy && p.puedoEditar).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const sinPartido = (carpetas ?? []).filter((c) => !c.partidoId);
  const { propuestas, sinPartido: sinPropuesta } = proponer(sinPartido, jugados, enlaces);
  const libres = jugados.filter((p) => !enlaces.some((e) => e.partidoId === p.id));
  const enlazados = enlaces
    .map((e) => ({ ...e, partido: todos.find((p) => p.id === e.partidoId) }))
    .filter((e) => e.partido)
    .sort((a, b) => b.partido.fecha.localeCompare(a.partido.fecha));
  const r = busqueda.resultado;
  // Carpetas sin partido en la app (partidos antiguos que nunca se cargaron).
  const paraCrear = sinPropuesta.map((c) => ({ c, e: plantelPara(c, equipos) })).filter((x) => x.e && x.c.dia);
  const crearTodos = async () => {
    setMasivo({ creando: true, hechos: 0, error: '' });
    let hechos = 0;
    for (const { c, e } of paraCrear) {
      try { await crearYEnlazar(c, e, enlazar); hechos++; setMasivo((m) => ({ ...m, hechos })); }
      catch (x) { setMasivo({ creando: false, hechos, error: `${c.nombre}: ${x.message}` }); return; }
    }
    setMasivo({ creando: false, hechos, error: '' });
  };

  return (
    <>
      <Link to="/mas" className="volver">‹ Más</Link>
      <h1 className="titulo display">Fotos de los partidos</h1>
      <p className="subtitulo">
        La app revisa sola el <a className="enlace" href={linkCarpeta(RAIZ_FOTOS_LIGA)} target="_blank" rel="noreferrer">Drive del fotógrafo de la liga</a> cada
        6 horas y enlaza las carpetas que calzan seguro con un partido. Acá confirmas las que quedaron en duda.
      </p>

      <div className="card">
        <button className="btn" onClick={buscar} disabled={busqueda.buscando}>
          {busqueda.buscando ? `Buscando… ${busqueda.avance ? plural(busqueda.avance.pendientes ?? 0, 'carpeta pendiente', 'carpetas pendientes') : ''}` : 'Buscar fotos nuevas'}
        </button>
        {busqueda.error && <p className="error" role="alert">{busqueda.error}</p>}
        {r?.sinLlave && <p className="error" role="alert">Falta conectar la llave de Google en la base. Mientras, puedes pegar el link de la carpeta en cada partido.</p>}
        {r?.error && <p className="error" role="alert">{r.error}</p>}
        {r && !r.sinLlave && !r.error && (
          <p className="exito" role="status">
            {r.enlazadas ? `Listo: ${plural(r.enlazadas, 'partido nuevo', 'partidos nuevos')} con fotos.` : 'Listo: no hay partidos nuevos para enlazar solos.'}
          </p>
        )}
        {r?.revisadaEn && <p className="nota">Última revisión: {hora(r.revisadaEn)}</p>}
      </div>

      <section className="grupo">
        <div className="sobretitulo">Falta confirmar</div>
        {errorCarpetas && <p className="error" role="alert">{errorCarpetas}</p>}
        {carpetas && !sinPartido.length && <p className="vacio">Todas las carpetas encontradas tienen su partido.</p>}
        {paraCrear.length > 1 && (
          <div className="card">
            <p className="sin-margen">
              {plural(paraCrear.length, 'carpeta es', 'carpetas son')} de partidos que no están en la app (anteriores a ella).
              Puedes crearlos como jugados, con su rival y su día, y quedan con sus fotos.
            </p>
            {masivo.error && <p className="error" role="alert">{masivo.error}</p>}
            <button className="btn secundario" style={{ marginTop: 12 }} disabled={masivo.creando} onClick={crearTodos}>
              {masivo.creando ? `Creando… ${masivo.hechos} de ${paraCrear.length}` : `Crear los ${paraCrear.length} partidos y enlazar sus fotos`}
            </button>
          </div>
        )}
        {propuestas.map(({ carpeta, partido }) => (
          <Carpeta key={carpeta.id} carpeta={carpeta} propuesto={partido} partidos={libres} enlazar={enlazar} />
        ))}
        {sinPropuesta.map((c) => (
          <Carpeta key={c.id} carpeta={c} propuesto={null} partidos={libres} enlazar={enlazar} equipo={plantelPara(c, equipos)} />
        ))}
      </section>

      <section className="grupo">
        <div className="sobretitulo">Con fotos</div>
        {!enlazados.length && <p className="vacio">Todavía no hay partidos con fotos.</p>}
        {enlazados.map((e) => (
          <div key={e.partidoId} className="fotos-carpeta">
            <div className="fotos-carpeta-nombre"><Link className="enlace" to={`/partidos/${e.partidoId}`}>{nombrePartido(e.partido)}</Link></div>
            <div className="fotos-carpeta-dato">
              <a className="enlace" href={linkCarpeta(e.carpetaId)} target="_blank" rel="noreferrer">{e.carpetaNombre}</a>
              {e.fotos != null && ` · ${plural(e.fotos, 'foto', 'fotos')}`}
              {e.automatico ? ' · se enlazó sola' : ' · enlazada a mano'}
              {e.puedoCambiar && <> · <button className="enlace quitar" onClick={() => desenlazar(e.partidoId)}>Quitar</button></>}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
