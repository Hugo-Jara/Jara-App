import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { accesoTablero } from '../lib/tablero.js';
import { useAccesoFondo } from '../lib/fondo.js';
import Icono from '../components/Icono.jsx';

// Lo administrativo del club vive acá, fuera de la pantalla de inicio.
export default function Mas() {
  const { persona } = useSesion();
  const veFondo = useAccesoFondo();
  const area = persona.club?.etiqueta_area || 'Ministerio';
  const FILAS = [
    { a: '/noticias', icono: 'noticias', nombre: 'Noticias', desc: 'Fotos, novedades y el boletín del club' },
    { a: '/cuota', icono: 'cuota', nombre: 'Mi cuota', desc: 'Tu estado de pago y las fechas que vienen' },
    { a: '/compras', icono: 'compras', nombre: 'Compras', desc: 'Pedir una compra con su cotización' },
    { a: '/club', icono: 'asambleas', nombre: 'Asambleas', desc: 'Tabla, link al Meet y actas' },
    { a: '/club', icono: 'club', nombre: `${area}s`, desc: 'Quién es quién y qué hace cada uno' },
  ];
  // Solo para encargados y administradores.
  if (persona.esEncargado) {
    FILAS.unshift({ a: '/ingresos', icono: 'club', nombre: 'Pases de ingreso', desc: 'Aprobar a quienes pidieron entrar a la app' });
  }
  if (accesoTablero(persona).puedeVer) {
    FILAS.splice(2, 0, { a: '/tablero', icono: 'cuota', nombre: 'Tablero de tesorería', desc: 'Cuotas, saldo y aporte al club · Datos de ejemplo' });
  }
  // Solo para el equipo del fondo, Hacienda y los administradores.
  if (veFondo) {
    FILAS.splice(3, 0, { a: '/fondo', icono: 'compras', nombre: 'Fondo Las Condes', desc: 'Gastos, respaldos y rendiciones del fondo' });
  }
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
