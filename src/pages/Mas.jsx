import { Link } from 'react-router-dom';
import { useSesion } from '../lib/sesion.jsx';
import { esDemo } from '../lib/supabase.js';
import { accesoTablero } from '../lib/tablero.js';
import { useAccesoFondo } from '../lib/fondo.js';
import { usePlantelesTesoreria } from '../lib/tesoreria.js';
import Icono from '../components/Icono.jsx';
import VerComo from '../components/VerComo.jsx';
import MiPerfil from '../components/MiPerfil.jsx';
import { usePuedeAprobarIngresos } from '../lib/ingreso.js';

// Lo administrativo del club vive acá, fuera de la pantalla de inicio.
export default function Mas() {
  const { persona } = useSesion();
  const veFondo = useAccesoFondo();
  const tesoreria = usePlantelesTesoreria();
  const apruebaIngresos = usePuedeAprobarIngresos(persona);
  const FILAS = [
    { a: '/noticias', icono: 'noticias', nombre: 'Noticias', desc: 'Fotos, novedades y el boletín del club' },
    { a: '/cuota', icono: 'cuota', nombre: 'Mi cuota', desc: 'Tu estado de pago y las fechas que vienen' },
    { a: '/planteles', icono: 'jugadores', nombre: 'Planteles', desc: 'Los jugadores de cada plantel, con dorsal y posición' },
    { a: '/compras', icono: 'compras', nombre: 'Compras', desc: 'Pedir una compra con su cotización' },
    // Asambleas y los ministerios vuelven a este menú cuando su pantalla exista (hoy /club está en construcción).
  ];
  // Un socio que no juega no paga cuota de plantel: no se le muestra "Mi cuota".
  if (!persona.equipos?.length) FILAS.splice(FILAS.findIndex((f) => f.a === '/cuota'), 1);
  // Solo para encargados y administradores.
  if (persona.esEncargado) {
    FILAS.unshift({ a: '/fotos-partidos', icono: 'noticias', nombre: 'Fotos de los partidos', desc: 'Enlazar cada partido con su carpeta del Drive' });
  }
  // Tesorería, encargados y administradores (migración 0057).
  if (apruebaIngresos) {
    FILAS.unshift({ a: '/ingresos', icono: 'club', nombre: 'Pases de ingreso', desc: 'Aprobar a quienes pidieron entrar a la app' });
  }
  // El tablero de ejemplo se ve solo en modo demostración.
  if (esDemo && accesoTablero(persona).puedeVer && !tesoreria?.length) {
    FILAS.splice(2, 0, { a: '/tablero', icono: 'cuota', nombre: 'Tablero de tesorería', desc: 'Cuotas, saldo y aporte al club · Datos de ejemplo' });
  }
  // Tesoreros de plantel, Hacienda y administradores (migración 0023).
  if (tesoreria?.length) {
    const solo = tesoreria.length === 1 ? ` de ${tesoreria[0].nombre}` : '';
    FILAS.splice(2, 0, { a: '/tesoreria', icono: 'cuota', nombre: `Tesorería${solo}`, desc: 'Cuotas, pagos, cobros y caja del plantel' });
  }
  // Solo para el equipo del fondo, Hacienda y los administradores.
  if (veFondo) {
    FILAS.splice(3, 0, { a: '/fondo', icono: 'compras', nombre: 'Fondo Las Condes', desc: 'Gastos, respaldos y rendiciones del fondo' });
  }
  return (
    <>
      <h1 className="titulo display">Más</h1>
      <p className="subtitulo">Lo administrativo del club.</p>
      <VerComo />
      <MiPerfil />
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
      <Link to="/ajustes" className="card fila" style={{ padding: '14px 20px' }}>
        <div className="modulo-icono"><Icono nombre="ajustes" /></div>
        <div className="modulo-cuerpo">
          <div className="modulo-nombre">Ajustes</div>
          <div className="modulo-desc">Contraseña, tema claro u oscuro, tamaño de letra y cerrar sesión</div>
        </div>
        <Icono nombre="flecha" size={18} />
      </Link>
    </>
  );
}
