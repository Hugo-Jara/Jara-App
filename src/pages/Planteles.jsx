import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { leerPlanteles, urlsDeFotos, nombrePosicion } from '../lib/perfil.js';
import FotoJugador from '../components/FotoJugador.jsx';
import NombreConApodo from '../components/NombreConApodo.jsx';

// Los jugadores de cada plantel con su foto, dorsal y posición. Tocando uno se
// abre su perfil.
export default function Planteles() {
  const { persona } = useSesion();
  const [planteles, setPlanteles] = useState(null);
  const [fotos, setFotos] = useState({});
  const [elegido, setElegido] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    leerPlanteles().then(async (l) => {
      setPlanteles(l);
      const mio = l.find((e) => persona.equipos?.some((m) => m.id === e.id));
      setElegido((mio ?? l[0])?.id ?? '');
      setFotos(await urlsDeFotos(l.flatMap((e) => e.jugadores.map((j) => j.foto_ruta))));
    }, (e) => setError(e.message));
  }, [persona]);

  const plantel = planteles?.find((e) => e.id === elegido);
  return (
    <>
      <Link to="/mas" className="volver">‹ Más</Link>
      <h1 className="titulo display">Planteles</h1>
      <p className="subtitulo">Quién es quién en cada plantel del club.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {!planteles && !error && <p className="vacio suelto">Cargando…</p>}
      {planteles?.length > 1 && (
        <div className="chips" role="radiogroup" aria-label="Plantel">
          {planteles.map((e) => (
            <button key={e.id} type="button" role="radio" aria-checked={elegido === e.id}
                    className={`chip ${elegido === e.id ? 'activo' : ''}`} onClick={() => setElegido(e.id)}>{e.nombre}</button>
          ))}
        </div>
      )}
      {plantel && (
        <div className="card lista" style={{ marginTop: 14 }}>
          {plantel.jugadores.length === 0 && <p className="vacio" style={{ padding: '15px 0' }}>Este plantel todavía no tiene jugadores cargados.</p>}
          {plantel.jugadores.map((j) => (
            <Link key={j.id} to={`/perfil/${j.id}`} className="fila perfil-fila">
              <span className="perfil-dorsal">{j.dorsal ?? ''}</span>
              <FotoJugador nombre={j.nombre} url={fotos[j.foto_ruta]} />
              <div className="modulo-cuerpo">
                <div className="modulo-nombre"><NombreConApodo id={j.id} nombre={j.nombre} apodo={j.apodo} /></div>
                {j.posicion && <div className="modulo-desc">{nombrePosicion(j.posicion)}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
