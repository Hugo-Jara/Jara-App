import { Link, Navigate } from 'react-router-dom';
import { documentalListo, urlIncrustada, urlYoutube } from '../lib/documental.js';
import { fiestaVisible } from '../lib/fiesta.js';

// El documental de los 20 años, incrustado desde YouTube.
export default function Documental() {
  if (!documentalListo()) return <Navigate to="/" replace />;
  return (
    <>
      <p><Link to={fiestaVisible() ? '/fiesta-20' : '/'} className="enlace">‹ {fiestaVisible() ? 'Galería de la fiesta' : 'Inicio'}</Link></p>
      <h1 className="titulo display">Documental: 20 años del Jara</h1>
      <div className="documental-marco">
        <iframe src={urlIncrustada()} title="Documental 20 años del Jara" loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
      </div>
      <p className="nota" style={{ textAlign: 'left' }}>
        Para verlo a pantalla completa, toca el cuadrado de la esquina del video o gira el teléfono.
        ¿No carga? <a className="enlace" href={urlYoutube()} target="_blank" rel="noopener noreferrer">Ábrelo en YouTube</a>.
      </p>
    </>
  );
}
