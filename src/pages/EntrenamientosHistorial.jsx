import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEntrenamiento, horario } from '../lib/entrenamiento.js';
import { useSesion } from '../lib/sesion.jsx';
import { useHistorialEntrenamientos, asistenciaPorPersona, PERIODOS } from '../lib/historialEntrenamientos.js';
import { fechaLarga, fechaCorta } from '../lib/fechas.js';
import { plural } from '../lib/texto.js';
import NombreConApodo from '../components/NombreConApodo.jsx';

// Historial de entrenamientos para quien los administra: quiénes fueron a cada
// uno y cuántas veces fue cada jugador en el período elegido.
export default function EntrenamientosHistorial() {
  const { persona } = useSesion();
  const permiso = useEntrenamiento(persona);
  const h = useHistorialEntrenamientos();
  const [periodo, setPeriodo] = useState('tres');
  const [vista, setVista] = useState('jugadores');

  const volver = <Link to="/entrenar" className="volver">‹ Entrenar</Link>;
  if (permiso.cargando || h.cargando) return <>{volver}<p className="vacio suelto">Cargando…</p></>;
  if (!permiso.puedoAdministrar) {
    return <>{volver}<p className="vacio suelto">El historial lo ve quien administra los entrenamientos.</p></>;
  }
  if (h.error) {
    return (
      <>{volver}
        <p className="error" role="alert">{h.error}</p>
        <button className="btn secundario" onClick={h.recargar}>Reintentar</button>
      </>
    );
  }

  const desde = PERIODOS.find((p) => p.id === periodo).desde();
  const sesiones = h.sesiones.filter((s) => s.fecha >= desde);
  const personas = asistenciaPorPersona(sesiones);
  const total = sesiones.reduce((n, s) => n + s.asistentes.length, 0);
  const promedio = sesiones.length ? Math.round(total / sesiones.length) : 0;

  return (
    <>
      {volver}
      <h1 className="titulo display">Historial</h1>
      <p className="ayuda">Quiénes fueron a cada entrenamiento. Cuenta quien quedó en la lista; quien se bajó el mismo día aparece aparte.</p>

      <div className="chips" role="group" aria-label="Período">
        {PERIODOS.map((p) => (
          <button key={p.id} className={`chip${periodo === p.id ? ' activo' : ''}`} aria-pressed={periodo === p.id}
                  onClick={() => setPeriodo(p.id)}>{p.nombre}</button>
        ))}
      </div>

      <div className="kpis" style={{ marginTop: 14 }}>
        <div className="kpi"><div className="kpi-etiqueta">Entrenamientos</div><div className="kpi-valor">{sesiones.length}</div></div>
        <div className="kpi"><div className="kpi-etiqueta">Promedio por día</div><div className="kpi-valor">{promedio}</div></div>
      </div>

      <div className="segmentos dos" role="group" aria-label="Ver">
        <button className={`segmento${vista === 'jugadores' ? ' activo voy' : ''}`} aria-pressed={vista === 'jugadores'}
                onClick={() => setVista('jugadores')}>Por jugador</button>
        <button className={`segmento${vista === 'sesiones' ? ' activo voy' : ''}`} aria-pressed={vista === 'sesiones'}
                onClick={() => setVista('sesiones')}>Por entrenamiento</button>
      </div>

      {sesiones.length === 0 ? (
        <p className="vacio suelto">No hay entrenamientos guardados en este período.</p>
      ) : vista === 'jugadores' ? (
        <div className="card tabla-goles">
          <div className="fila-tabla cabeza">
            <span className="puesto" />
            <span className="quien">Jugador</span>
            <span className="col-historial">Fue</span>
          </div>
          {personas.map((p, i) => (
            <div key={p.personaId} className={`fila-tabla${p.personaId === persona.id ? ' yo' : ''}`}>
              <span className="puesto">{i + 1}</span>
              <span className="quien">
                <NombreConApodo id={p.personaId} nombre={p.nombre} enlace />
                <span className="comentario-historial">última vez el {fechaCorta(p.ultima)}</span>
              </span>
              <span className="col-historial">
                <strong>{p.veces}</strong> de {sesiones.length}
              </span>
            </div>
          ))}
        </div>
      ) : (
        sesiones.map((s) => {
          const invitados = s.asistentes.filter((a) => a.invitado).length;
          return (
            <details key={s.id} className="card sesion-historial">
              <summary>
                <span className="sesion-fecha">{fechaLarga(s.fecha)}</span>
                <span className="sesion-resumen">
                  {plural(s.asistentes.length, 'fue', 'fueron')}
                  {invitados > 0 ? ` (${plural(invitados, 'invitado', 'invitados')})` : ''}
                  {[horario(s), s.lugar].filter(Boolean).length > 0 ? ` · ${[horario(s), s.lugar].filter(Boolean).join(' · ')}` : ''}
                </span>
              </summary>
              <ol className="nombres">
                {s.asistentes.map((a, k) => (
                  <li key={a.personaId ?? `inv-${k}`}>
                    <span className="nombre"><NombreConApodo id={a.personaId} nombre={a.nombre} enlace /></span>
                    {a.invitado && <span className="marca">invitado{a.invitadoPor ? ` de ${a.invitadoPor.split(' ')[0]}` : ''}</span>}
                  </li>
                ))}
              </ol>
              {s.bajasTarde.length > 0 && (
                <>
                  <h3 className="grupo-titulo baja">Se bajaron el mismo día <span>{s.bajasTarde.length}</span></h3>
                  <ol className="nombres">
                    {s.bajasTarde.map((b, k) => (
                      <li key={b.personaId ?? `b-${k}`}><span className="nombre"><NombreConApodo id={b.personaId} nombre={b.nombre} enlace /></span></li>
                    ))}
                  </ol>
                </>
              )}
            </details>
          );
        })
      )}
    </>
  );
}
