import { NavLink } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import Icono from './Icono.jsx';
import { ESCUDO } from '../lib/base.js';

const NAV = [
  { a: '/', icono: 'inicio', texto: 'Inicio' },
  { a: '/partidos', icono: 'partidos', texto: 'Partidos' },
  { a: '/entrenar', icono: 'entrenar', texto: 'Entrenar' },
  { a: '/noticias', icono: 'noticias', texto: 'Noticias' },
  { a: '/mas', icono: 'mas', texto: 'Más' },
];

export default function Marco({ children }) {
  const { persona, esDemo, salir } = useSesion();
  return (
    <>
      <div className="pagina">
        <header className="barra">
          <img src={ESCUDO} alt="Escudo del Club Hugo Jara" />
          <div className="barra-texto">
            <div className="barra-nombre display">Jara App</div>
            <div className="barra-sub">{persona.club?.nombre}</div>
          </div>
          {!esDemo && <button className="btn-salir" onClick={salir}>Salir</button>}
        </header>
        {esDemo && (
          <div className="aviso-demo">
            Modo demostración: los partidos, fotos y noticias son de ejemplo y nada se guarda.
          </div>
        )}
        <main>{children}</main>
      </div>
      <nav className="nav" aria-label="Secciones">
        <div className="nav-interior">
          {NAV.map((n) => (
            <NavLink key={n.a} to={n.a} end={n.a === '/'} className={({ isActive }) => (isActive ? 'activo' : '')}>
              <Icono nombre={n.icono} />
              {n.texto}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
