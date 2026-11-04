import { useApodos } from '../lib/apodos.js';

// "Sergio Bravo · el Checho": el nombre real y, chico al lado, el apodo si tiene.
export default function NombreConApodo({ id, nombre, apodo }) {
  const apodos = useApodos();
  const a = apodo ?? apodos[id];
  return <>{nombre}{a && <span className="apodo"> · {a}</span>}</>;
}
