import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { leerPerfil, urlsDeFotos } from '../lib/perfil.js';
import FotoJugador from './FotoJugador.jsx';
import Icono from './Icono.jsx';

// Más > Mi perfil: la puerta a la ficha propia, con la foto si ya tiene.
export default function MiPerfil() {
  const { persona } = useSesion();
  const [foto, setFoto] = useState(null);
  useEffect(() => {
    leerPerfil().then(async (p) => {
      if (p.foto_ruta) setFoto((await urlsDeFotos([p.foto_ruta]))[p.foto_ruta]);
    }).catch(() => {});
  }, []);
  return (
    <Link to="/perfil" className="card fila perfil-fila" style={{ padding: '14px 20px' }}>
      <FotoJugador nombre={persona.nombre} url={foto} tamano={52} />
      <div className="modulo-cuerpo">
        <div className="modulo-nombre">Mi perfil</div>
        <div className="modulo-desc">Tu foto, apodo, dorsal, posición y pie hábil</div>
      </div>
      <Icono nombre="flecha" size={18} />
    </Link>
  );
}
