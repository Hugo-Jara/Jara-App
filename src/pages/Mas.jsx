import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import Icono from '../components/Icono.jsx';

// Lo administrativo del club vive acá, fuera de la pantalla de inicio.
export default function Mas() {
  const { persona } = useSesion();
  const area = persona.club?.etiqueta_area || 'Ministerio';
  const FILAS = [
    { a: '/cuota', icono: 'cuota', nombre: 'Mi cuota', desc: 'Tu estado de pago y las fechas que vienen' },
    { a: '/compras', icono: 'compras', nombre: 'Compras', desc: 'Pedir una compra con su cotización' },
    { a: '/club', icono: 'asambleas', nombre: 'Asambleas', desc: 'Tabla, link al Meet y actas' },
    { a: '/club', icono: 'club', nombre: `${area}s`, desc: 'Quién es quién y qué hace cada uno' },
  ];
  return (
    <>
      <h1 className="titulo display">Más</h1>
      <p className="subtitulo">Lo administrativo del club.</p>
      <div className="card lista">
        {FILAS.map((f) => (
          <Link key={f.nombre} to={f.a} className="fila">
            <div className="modulo-icono"><Icono nombre={f.icono} /></div>
            <div className="modulo-cuerpo">
              <div className="modulo-nombre">{f.nombre}</div>
              <div className="modulo-desc">{f.desc}</div>
            </div>
            <Icono nombre="flecha" size={18} />
          </Link>
        ))}
      </div>
    </>
  );
}
