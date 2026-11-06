import { useState } from 'react';
import { useSesion } from '../lib/sesion.jsx';
import { useFechasLiga, separar, jugado, actualizarLiga } from '../lib/liga.js';
import { usePartidos } from '../lib/partidos.js';
import { fechaLarga } from '../lib/fechas.js';

const DE_A_POCAS = 3;

function Partido({ p }) {
  const fin = jugado(p);
  const gana = (a, b) => (fin && a > b ? ' gana' : '');
  return (
    <li className={`liga-partido${p.esJara ? ' jara' : ''}`}>
      <span className="liga-partido-hora">{p.hora}{p.cancha ? ` · ${p.cancha}` : ''}</span>
      <span className={`liga-partido-equipo${gana(p.golesLocal, p.golesVisita)}`}>{p.local}</span>
      <span className="liga-partido-goles">{fin ? p.golesLocal : ''}</span>
      <span className={`liga-partido-equipo${gana(p.golesVisita, p.golesLocal)}`}>{p.visita}</span>
      <span className="liga-partido-goles">{fin ? p.golesVisita : ''}</span>
    </li>
  );
}

function Fecha({ f }) {
  return (
    <section className="liga-fecha">
      <h3 className="liga-fecha-titulo">{f.fecha ? `${f.fecha} · ` : ''}{fechaLarga(f.dia)}</h3>
      <ul className="card liga-partidos">
        {f.partidos.map((p) => <Partido key={p.id} p={p} />)}
      </ul>
    </section>
  );
}

// Todos los partidos del campeonato de cada plantel, no solo los del Jara:
// primero la fecha que viene, después los resultados.
export default function FechasLiga() {
  const { persona } = useSesion();
  const { cargando, error, conectados, partidos } = useFechasLiga();
  const { recargar: recargarPartidos } = usePartidos(persona);
  const [elegido, setElegido] = useState(null);
  const [cuantas, setCuantas] = useState(DE_A_POCAS);
  const [trayendo, setTrayendo] = useState(false);
  const [aviso, setAviso] = useState('');

  if (error) return <p className="error" role="alert">{error}</p>;
  if (cargando && !conectados.length) return <p className="vacio suelto">Cargando…</p>;
  if (!conectados.length) {
    return <p className="vacio suelto">Todavía no están conectadas las fechas de la liga. Por ahora mira los partidos del Jara en la pestaña Partidos.</p>;
  }

  const planteles = conectados.map((c) => [c.equipoId, c.equipo]);
  const propio = planteles.find(([id]) => persona.equipos?.some((e) => e.id === id))?.[0];
  const actual = elegido ?? propio ?? planteles[0][0];
  const conexion = conectados.find((c) => c.equipoId === actual);
  const { proximas, jugadas } = separar(partidos.filter((p) => p.equipoId === actual));
  const traerAhora = async () => {
    setTrayendo(true); setAviso('');
    try { await actualizarLiga(actual); await recargarPartidos(); setAviso('Listo: las fechas quedaron al día con la liga.'); }
    catch (e) { setAviso(e.message); }
    finally { setTrayendo(false); }
  };

  return (
    <>
      {planteles.length > 1 && (
        <div className="chips" role="radiogroup" aria-label="Plantel" style={{ marginTop: 0, marginBottom: 12 }}>
          {planteles.map(([id, nombre]) => (
            <button key={id} type="button" role="radio" aria-checked={id === actual}
                    className={`chip ${id === actual ? 'activo' : ''}`}
                    onClick={() => { setElegido(id); setCuantas(DE_A_POCAS); setAviso(''); }}>{nombre}</button>
          ))}
        </div>
      )}
      <h2 className="seccion">Lo que viene</h2>
      {proximas.length ? proximas.map((f) => <Fecha key={f.dia + f.fecha} f={f} />)
        : <p className="vacio suelto">La liga todavía no publica la próxima fecha.</p>}
      <h2 className="seccion">Resultados</h2>
      {jugadas.length ? jugadas.slice(0, cuantas).map((f) => <Fecha key={f.dia + f.fecha} f={f} />)
        : <p className="vacio suelto">Todavía no hay resultados.</p>}
      {jugadas.length > cuantas && (
        <button type="button" className="btn secundario" onClick={() => setCuantas(cuantas + DE_A_POCAS)}>
          Ver fechas anteriores ({jugadas.length - cuantas})
        </button>
      )}
      <p className="ayuda abajo">Se actualizan solas desde la página de la liga. Los partidos del Jara quedan creados en la pestaña Partidos.</p>
      {aviso && <p className="ayuda abajo" role="status">{aviso}</p>}
      {conexion?.puedoActualizar && (
        <button type="button" className="btn secundario" style={{ marginTop: 12 }} onClick={traerAhora} disabled={trayendo}>
          {trayendo ? 'Trayendo las fechas…' : 'Actualizar desde la liga'}
        </button>
      )}
    </>
  );
}
