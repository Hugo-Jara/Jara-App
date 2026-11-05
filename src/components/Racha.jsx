import { Link } from 'react-router-dom';
import { racha, signo } from '../lib/partidos.js';
import { fechaCorta } from '../lib/fechas.js';

const MARCA = { G: '✓', E: '=', P: '✗' };
const TEXTO = { G: 'Ganado', E: 'Empatado', P: 'Perdido' };

// Los últimos 5 resultados de un plantel, como en las apps de fútbol:
// ✓ ganado, = empatado, ✗ perdido. El más reciente queda a la derecha.
export default function Racha({ jugados }) {
  const ultimos = racha(jugados).reverse();
  if (!ultimos.length) return null;
  return (
    <span className="racha" aria-label={`Últimos ${ultimos.length} resultados, del más antiguo al más reciente`}>
      {ultimos.map((p) => (
        <Link key={p.id} to={`/partidos/${p.id}`} className={`racha-marca ${signo(p)}`}
              title={`${TEXTO[signo(p)]} ${p.golesFavor}–${p.golesContra} vs ${p.rival} (${fechaCorta(p.fecha)})`}
              aria-label={`${TEXTO[signo(p)]} ${p.golesFavor} a ${p.golesContra} contra ${p.rival}`}>
          {MARCA[signo(p)]}
        </Link>
      ))}
    </span>
  );
}
