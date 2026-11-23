import { Link } from 'react-router-dom';
import { documentalListo } from '../lib/documental.js';

// Segundo botón de la tarjeta de la fiesta: lleva al documental.
export default function BotonDocumental() {
  if (!documentalListo()) {
    return <button className="btn secundario fiesta-documental" disabled>▶ Documental: muy pronto</button>;
  }
  return <Link to="/documental" className="btn secundario fiesta-documental">▶ Ver documental</Link>;
}
