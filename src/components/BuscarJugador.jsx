import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buscarPersonas } from '../lib/buscar.js';
import { useApodos } from '../lib/apodos.js';
import { urlsDeFotos } from '../lib/perfil.js';
import FotoJugador from './FotoJugador.jsx';

// Caja para buscar a alguien del club por nombre, apellido o apodo. Mientras se
// escribe sugiere personas (sin importar tildes ni mayúsculas) y al tocar una
// se abre su perfil. `personas`: [{ id, nombre, apodo?, foto_ruta?, planteles? }].
// `detalle(persona)` agrega texto bajo el nombre (si no, sus planteles).
export default function BuscarJugador({ personas, detalle }) {
  const navegar = useNavigate();
  const apodos = useApodos();
  const id = useId();
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [marcada, setMarcada] = useState(0);
  const [fotos, setFotos] = useState({});

  // Si la lista no trae el apodo, se usa el que eligió la persona.
  const conApodo = useMemo(() => (personas ?? []).map((p) => (p.apodo ? p : { ...p, apodo: apodos[p.id] ?? '' })), [personas, apodos]);
  const sugeridas = useMemo(() => buscarPersonas(conApodo, texto), [conApodo, texto]);
  const mostrar = abierto && texto.trim() !== '';

  const claveFotos = sugeridas.map((p) => p.foto_ruta ?? '').join();
  useEffect(() => {
    let vigente = true;
    const rutas = sugeridas.map((p) => p.foto_ruta).filter(Boolean);
    if (rutas.length) urlsDeFotos(rutas).then((u) => vigente && setFotos((f) => ({ ...f, ...u })), () => {});
    return () => { vigente = false; };
  }, [claveFotos]); // eslint-disable-line react-hooks/exhaustive-deps

  const elegir = (p) => { setAbierto(false); navegar(`/perfil/${p.id}`); };
  const teclas = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setMarcada((m) => Math.min(m + 1, sugeridas.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMarcada((m) => Math.max(m - 1, 0)); }
    else if (e.key === 'Enter' && mostrar && sugeridas[marcada]) { e.preventDefault(); elegir(sugeridas[marcada]); }
    else if (e.key === 'Escape') { setAbierto(false); }
  };

  return (
    <div className="buscador" role="search">
      <label htmlFor={`${id}-caja`} className="sr-solo">Buscar a un jugador</label>
      <div className="buscador-caja">
        <svg className="buscador-lupa" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input id={`${id}-caja`} type="search" value={texto} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
               enterKeyHint="search" placeholder="Busca por nombre, apellido o apodo"
               role="combobox" aria-autocomplete="list" aria-expanded={mostrar && sugeridas.length > 0} aria-controls={`${id}-lista`}
               aria-activedescendant={mostrar && sugeridas[marcada] ? `${id}-op-${marcada}` : undefined}
               onChange={(e) => { setTexto(e.target.value); setAbierto(true); setMarcada(0); }}
               onFocus={() => setAbierto(true)} onBlur={() => setAbierto(false)} onKeyDown={teclas} />
        {texto && (
          <button type="button" className="buscador-borrar" aria-label="Borrar búsqueda"
                  onMouseDown={(e) => e.preventDefault()} onClick={() => { setTexto(''); setMarcada(0); }}>×</button>
        )}
      </div>
      {mostrar && sugeridas.length > 0 && (
        <ul className="buscador-lista" id={`${id}-lista`} role="listbox" aria-label="Personas sugeridas">
          {sugeridas.map((p, i) => (
            <li key={p.id} id={`${id}-op-${i}`} role="option" aria-selected={i === marcada}
                className={`buscador-op ${i === marcada ? 'marcada' : ''}`}
                onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setMarcada(i)} onClick={() => elegir(p)}>
              <FotoJugador nombre={p.nombre} url={fotos[p.foto_ruta]} tamano={36} />
              <span className="buscador-texto">
                <span className="opcion-nombre">{p.nombre}{p.apodo && <span className="apodo"> · {p.apodo}</span>}</span>
                <span className="opcion-detalle">{detalle ? detalle(p) : (p.planteles ?? []).join(' · ') || 'Socio del club'}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {mostrar && sugeridas.length === 0 && (
        <p className="buscador-nada" role="status">No encontramos a nadie con «{texto.trim()}». Prueba con el apellido o el apodo.</p>
      )}
    </div>
  );
}
