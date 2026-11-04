import { Link } from 'react-router-dom';
import { useApodos } from '../lib/apodos.js';

// "Sergio Bravo · el Checho": el nombre real y, chico al lado, el apodo si tiene.
// Con `enlace`, tocar el nombre abre el perfil del jugador (no usarlo dentro de
// otro botón o link, como al votar el MVP).
export default function NombreConApodo({ id, nombre, apodo, enlace = false }) {
  const apodos = useApodos();
  const a = apodo ?? apodos[id];
  const texto = <>{nombre}{a && <span className="apodo"> · {a}</span>}</>;
  return enlace && id ? <Link to={`/perfil/${id}`} className="nombre-enlace">{texto}</Link> : texto;
}
