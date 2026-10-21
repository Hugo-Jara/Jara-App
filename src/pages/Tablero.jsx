import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { useTablero, accesoTablero } from '../lib/tablero.js';
import EtiquetaDemo from '../components/tablero/EtiquetaDemo.jsx';
import PlantelTablero from '../components/tablero/PlantelTablero.jsx';
import ConsolidadoHacienda from '../components/tablero/ConsolidadoHacienda.jsx';

// Tablero de tesoreros. Tesorero de plantel: solo ve su plantel. Hacienda:
// el consolidado y los tres planteles. Por ahora con datos de ejemplo.
export default function Tablero() {
  const { persona, esDemo } = useSesion();
  const tablero = useTablero();
  const [params] = useSearchParams();
  const [elegido, setElegido] = useState('consolidado');

  // En modo demostración se puede revisar la vista de un tesorero con ?como=senior-jueves.
  const acceso = esDemo && params.get('como')
    ? { hacienda: false, plantelesPropios: [params.get('como')], puedeVer: true }
    : accesoTablero(persona);
  if (!acceso.puedeVer) return <Navigate to="/" replace />;

  const visibles = acceso.hacienda ? tablero.planteles : tablero.planteles.filter((p) => acceso.plantelesPropios.includes(p.id));
  if (visibles.length === 0) {
    return (
      <>
        <h1 className="titulo display">Tablero</h1>
        <EtiquetaDemo />
        <p className="subtitulo">Todavía no hay un tablero para tu plantel.</p>
      </>
    );
  }

  const actual = visibles.find((p) => p.id === elegido) ?? (acceso.hacienda ? null : visibles[0]);
  const pestañas = acceso.hacienda
    ? [{ id: 'consolidado', nombre: 'Consolidado' }, ...visibles.map((p) => ({ id: p.id, nombre: p.nombre }))]
    : visibles.length > 1 ? visibles.map((p) => ({ id: p.id, nombre: p.nombre })) : [];

  return (
    <>
      <h1 className="titulo display">{acceso.hacienda ? 'Tablero de Hacienda' : `Tablero · ${actual.nombre}`}</h1>
      <p className="subtitulo">{tablero.temporada.nombre}. El resumen llega hasta octubre y los movimientos son de octubre.</p>
      <EtiquetaDemo />
      {pestañas.length > 0 && (
        <div className="filtros" role="tablist" aria-label="Planteles">
          {pestañas.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={(actual?.id ?? 'consolidado') === t.id}
              className={`filtro${(actual?.id ?? 'consolidado') === t.id ? ' activo' : ''}`} onClick={() => setElegido(t.id)}>
              {t.nombre}
            </button>
          ))}
        </div>
      )}
      {actual
        ? <PlantelTablero key={actual.id} plantel={actual} temporada={tablero.temporada} />
        : <ConsolidadoHacienda planteles={visibles} consolidado={tablero.consolidado} entrenamiento={tablero.entrenamiento} onAbrir={setElegido} />}
    </>
  );
}
