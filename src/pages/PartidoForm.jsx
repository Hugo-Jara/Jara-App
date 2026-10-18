import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { usePartidos, equiposDelClub } from '../lib/partidos.js';
import { complejoDe } from '../lib/complejos.js';
import { fechaLarga, hoyIso, proximoDia, correrDias } from '../lib/fechas.js';

// Los próximos días de juego del plantel (su día de la semana), para elegir sin escribir.
const proximosDias = (diaSemana, n = 10) => {
  const primero = proximoDia(diaSemana);
  const hoy = hoyIso();
  const dias = [];
  if (new Date(`${hoy}T12:00:00`).getDay() === diaSemana) dias.push(hoy);
  for (let i = 0; dias.length < n; i += 1) dias.push(correrDias(primero, 7 * i));
  return dias;
};

// Acepta "2030", "20:30", "20.30" o "8:30" y lo deja como "20:30". Vacío es válido (es opcional).
const normalizarHora = (texto) => {
  const t = texto.trim().replace('.', ':');
  if (!t) return '';
  const m = t.match(/^(\d{1,2}):?(\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
};

// Programar o corregir un partido. Lo usa el encargado del plantel; un
// administrador puede hacerlo para cualquier plantel.
export default function PartidoForm() {
  const { id } = useParams();
  const ir = useNavigate();
  const { persona } = useSesion();
  const { cargando, todos, guardar, eliminar } = usePartidos(persona);
  const actual = id ? todos.find((p) => p.id === id) : null;
  const [equipos, setEquipos] = useState([]);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [otroDia, setOtroDia] = useState(false);

  // Los planteles que puede elegir: todos si es administrador, si no los suyos como encargado.
  useEffect(() => {
    if (persona.esAdmin) equiposDelClub().then(setEquipos, () => {});
    else setEquipos(persona.equipos.filter((e) => e.encargado));
  }, [persona]);

  useEffect(() => {
    if (d || cargando || (id && !actual)) return;
    setD(actual
      ? { equipoId: actual.equipoId, rival: actual.rival, fecha: actual.fecha, citacion: actual.citacion ?? '',
          cancha: actual.cancha ?? '', torneo: actual.torneo ?? '', tercerTiempo: actual.tercerTiempo ?? '' }
      : { equipoId: '', rival: '', fecha: '', citacion: '', cancha: '', torneo: '', tercerTiempo: '' });
  }, [d, cargando, id, actual]);

  if (!persona.esEncargado) return <p className="vacio suelto">Los partidos los programa el encargado de cada plantel.</p>;
  if (cargando || !d) {
    return id && !cargando && !actual
      ? <p className="vacio suelto">Ese partido ya no existe. <Link className="enlace" to="/partidos">Volver</Link></p>
      : <p className="vacio suelto">Cargando…</p>;
  }
  const set = (campo) => (e) => setD({ ...d, [campo]: e.target.value });
  const equipoId = d.equipoId || (equipos.length === 1 ? equipos[0].id : '');
  const nombreEquipo = actual ? actual.equipo : equipos.find((eq) => eq.id === equipoId)?.nombre;
  const complejo = nombreEquipo ? complejoDe(nombreEquipo) : null;
  const dias = complejo?.dia != null ? proximosDias(complejo.dia) : null;
  // Si el partido ya tiene un día que no es de la lista (p. ej. al editar), se muestra el calendario.
  const diasConActual = dias && d.fecha && !dias.includes(d.fecha) && !otroDia ? null : dias;
  const canchas = complejo?.canchas
    ? Array.from({ length: complejo.canchas }, (_, i) => `Cancha ${i + 1}`)
    : null;

  const enviar = async (e) => {
    e.preventDefault();
    if (!equipoId) return setError('Elige el plantel.');
    if (!d.fecha) return setError('Elige el día del partido.');
    const hora = normalizarHora(d.citacion);
    if (hora === null) return setError('La hora de citación no se entiende. Escríbela así: 20:30.');
    setError(''); setOcupado(true);
    try {
      await guardar({ ...d, citacion: hora, id: actual?.id, equipoId });
      ir(actual ? `/partidos/${actual.id}` : '/partidos');
    } catch (x) { setError(x.message); setOcupado(false); }
  };

  return (
    <>
      <Link to={actual ? `/partidos/${actual.id}` : '/partidos'} className="volver">‹ Volver</Link>
      <h1 className="titulo display">{actual ? 'Editar partido' : 'Programar partido'}</h1>
      <form className="card" onSubmit={enviar}>
        <label htmlFor="pf-equipo" style={{ marginTop: 0 }}>Plantel</label>
        {actual
          ? <input id="pf-equipo" value={actual.equipo} disabled />
          : (
            <select id="pf-equipo" required value={equipoId} onChange={set('equipoId')}>
              {equipos.length !== 1 && <option value="">Elige…</option>}
              {equipos.map((eq) => <option key={eq.id} value={eq.id}>{eq.nombre}</option>)}
            </select>
          )}
        <label htmlFor="pf-rival">Rival</label>
        <input id="pf-rival" required value={d.rival} onChange={set('rival')} />
        <label htmlFor="pf-fecha">Día</label>
        {diasConActual && !otroDia ? (
          <select id="pf-fecha" required value={d.fecha} onChange={(e) => {
            if (e.target.value === 'otro') setOtroDia(true); else setD({ ...d, fecha: e.target.value });
          }}>
            {!d.fecha && <option value="">Elige el día…</option>}
            {diasConActual.map((f) => <option key={f} value={f}>{fechaLarga(f)}</option>)}
            <option value="otro">Otro día…</option>
          </select>
        ) : (
          <input id="pf-fecha" type="date" required value={d.fecha} onChange={set('fecha')} />
        )}
        {d.fecha && <p className="ayuda">{fechaLarga(d.fecha)}</p>}
        <label htmlFor="pf-citacion">Hora de citación (opcional)</label>
        <input id="pf-citacion" inputMode="numeric" autoComplete="off" placeholder="Ej.: 20:30" value={d.citacion}
               onChange={set('citacion')}
               onBlur={() => { const h = normalizarHora(d.citacion); if (h !== null) setD((x) => ({ ...x, citacion: h })); }} />
        <label htmlFor="pf-cancha">Cancha</label>
        {canchas ? (
          <select id="pf-cancha" value={d.cancha} onChange={set('cancha')}>
            <option value="">Aún sin definir</option>
            {d.cancha && !canchas.includes(d.cancha) && <option value={d.cancha}>{d.cancha}</option>}
            {canchas.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : (
          <input id="pf-cancha" value={d.cancha} onChange={set('cancha')} placeholder="Ej.: Cancha 1, Complejo…" />
        )}
        <label htmlFor="pf-torneo">Torneo o fecha (opcional)</label>
        <input id="pf-torneo" value={d.torneo} onChange={set('torneo')} placeholder="Ej.: 2ª fecha Clausura" />
        <label htmlFor="pf-tercer">Tercer tiempo (opcional)</label>
        <input id="pf-tercer" value={d.tercerTiempo} onChange={set('tercerTiempo')} placeholder="Ej.: Asado después del partido" />
        <p className="ayuda abajo">Si lo llenas, quienes confirmen podrán marcar si se quedan.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="botones">
          <button className="btn" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>

      {actual && (borrando ? (
        <div className="item-comentario">
          ¿Eliminar este partido? Se pierden las respuestas de todos.
          <div className="botones chicos">
            <button className="btn chico" disabled={ocupado}
                    onClick={async () => { setOcupado(true); try { await eliminar(actual.id); ir('/partidos'); } catch (x) { setError(x.message); setOcupado(false); } }}>
              Sí, eliminar
            </button>
            <button className="btn chico secundario" onClick={() => setBorrando(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <p className="ayuda abajo"><button className="enlace" onClick={() => setBorrando(true)}>Eliminar este partido</button></p>
      ))}
    </>
  );
}
