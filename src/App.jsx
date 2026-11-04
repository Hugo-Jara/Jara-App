import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSesion } from './lib/sesion.jsx';
import Marco from './components/Marco.jsx';
import Ingreso from './pages/Ingreso.jsx';
import ElegirNombre from './pages/ElegirNombre.jsx';
import ElegirClave from './pages/ElegirClave.jsx';
import SinConexion from './pages/SinConexion.jsx';
import Inicio from './pages/Inicio.jsx';
import Partidos from './pages/Partidos.jsx';
import Partido from './pages/Partido.jsx';
import PartidoForm from './pages/PartidoForm.jsx';
import Estadisticas from './pages/Estadisticas.jsx';
import EntrenamientoForm from './pages/EntrenamientoForm.jsx';
import Ingresos from './pages/Ingresos.jsx';
import Cuota from './pages/Cuota.jsx';
import Compras from './pages/Compras.jsx';
import Club from './pages/Club.jsx';
import Entrenar from './pages/Entrenar.jsx';
import Noticias from './pages/Noticias.jsx';
import Mas from './pages/Mas.jsx';
import Publicacion from './pages/Publicacion.jsx';
import Publicar from './pages/Publicar.jsx';
import Pedido from './pages/Pedido.jsx';
import Solicitar from './pages/Solicitar.jsx';
import Fondo from './pages/Fondo.jsx';
import Tablero from './pages/Tablero.jsx';
import Tesoreria from './pages/Tesoreria.jsx';
import Perfil from './pages/Perfil.jsx';
import Planteles from './pages/Planteles.jsx';
import FotosDrive from './pages/FotosDrive.jsx';

export default function App() {
  const { cargando, sesion, persona, sinConexion, esDemo, ofrecerClave } = useSesion();
  const { pathname } = useLocation();

  // El pedido de compras es una página suelta: se entra con un link, sin cuenta
  // y sin el resto de la app alrededor.
  if (pathname.startsWith('/pedido/')) return <Pedido />;
  // Link público de un tópico de Compras: solo sirve para enviar una solicitud.
  if (pathname.startsWith('/solicitar/')) return <Solicitar />;

  // En modo demostración, /ingreso muestra la pantalla de entrada para revisarla.
  if (esDemo && pathname === '/ingreso') return <Ingreso />;
  if (esDemo && pathname === '/sin-conexion') return <SinConexion />;
  if (esDemo && pathname === '/clave') return <ElegirClave />;

  if (cargando) return <div className="cargando">Cargando…</div>;
  if (!esDemo && !sesion) return <Ingreso />;
  // Recién entró con link o código: se le ofrece dejar contraseña (puede saltarlo).
  if (!esDemo && ofrecerClave) return <ElegirClave />;
  // Si no se pudo preguntar quién es, no se le pide buscar su nombre de nuevo.
  if (!esDemo && persona === undefined && sinConexion) return <SinConexion />;
  if (!esDemo && persona === null) return <ElegirNombre />;
  if (!persona) return <div className="cargando">Cargando…</div>;

  return (
    <Marco>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/partidos" element={<Partidos />} />
        <Route path="/partidos/nuevo" element={<PartidoForm />} />
        <Route path="/partidos/:id" element={<Partido />} />
        <Route path="/partidos/:id/editar" element={<PartidoForm />} />
        <Route path="/jugadores" element={<Estadisticas />} />
        <Route path="/estadisticas" element={<Navigate to="/jugadores" replace />} />
        <Route path="/entrenar" element={<Entrenar />} />
        <Route path="/entrenar/lista" element={<EntrenamientoForm />} />
        <Route path="/ingresos" element={<Ingresos />} />
        <Route path="/noticias" element={<Noticias />} />
        <Route path="/noticias/nueva" element={<Publicar />} />
        <Route path="/noticias/:id" element={<Publicacion />} />
        <Route path="/mas" element={<Mas />} />
        <Route path="/cuota" element={<Cuota />} />
        <Route path="/compras" element={<Compras />} />
        <Route path="/tablero" element={<Tablero />} />
        <Route path="/tesoreria" element={<Tesoreria />} />
        <Route path="/fondo" element={<Fondo />} />
        <Route path="/club" element={<Club />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="/perfil/:id" element={<Perfil />} />
        <Route path="/planteles" element={<Planteles />} />
        <Route path="/fotos-partidos" element={<FotosDrive />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Marco>
  );
}
