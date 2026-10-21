import { useState } from 'react';
import ResumenPlantel from './ResumenPlantel.jsx';
import ListaCuotas from './ListaCuotas.jsx';
import Movimientos from './Movimientos.jsx';
import AporteClub from './AporteClub.jsx';

const VISTAS = [
  { id: 'resumen', nombre: 'Resumen' },
  { id: 'cuotas', nombre: 'Cuotas' },
  { id: 'movimientos', nombre: 'Movimientos' },
];

// Tablero completo de un plantel. Solo recibe datos ya calculados.
export default function PlantelTablero({ plantel, temporada }) {
  const [vista, setVista] = useState('resumen');
  return (
    <>
      <div className="filtros" role="tablist" aria-label="Secciones del tablero">
        {VISTAS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={vista === v.id}
            className={`filtro${vista === v.id ? ' activo' : ''}`} onClick={() => setVista(v.id)}>
            {v.nombre}
          </button>
        ))}
      </div>
      {vista === 'resumen' && (
        <>
          <ResumenPlantel plantel={plantel} temporada={temporada} />
          <AporteClub aporte={plantel.aporte} />
        </>
      )}
      {vista === 'cuotas' && <ListaCuotas jugadores={plantel.jugadores} mesActual={temporada.mesActual} />}
      {vista === 'movimientos' && <Movimientos plantel={plantel} />}
    </>
  );
}
