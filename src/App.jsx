import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSesion } from './lib/sesion.jsx';
import Marco from './components/Marco.jsx';
import Ingreso from './pages/Ingreso.jsx';
import SinNomina from './pages/SinNomina.jsx';
import Inicio from './pages/Inicio.jsx';
import Partidos from './pages/Partidos.jsx';
import Cuota from './pages/Cuota.jsx';
import Compras from './pages/Compras.jsx';
import Club from './pages/Club.jsx';
import Entrenar from './pages/Entrenar.jsx';
import Noticias from './pages/Noticias.jsx';
import Mas from './pages/Mas.jsx';
import Publicacion from './pages/Publicacion.jsx';
import Publicar from './pages/Publicar.jsx';
import Pedido from './pages/Pedido.jsx';

export default function App() {
  const { cargando, sesion, persona, esDemo } = useSesion();
  const { pathname } = useLocation();

  // El pedido de compras es una página suelta: se entra con un link, sin cuenta
  // y sin el resto de la app alrededor.
  if (pathname.startsWith('/pedido/')) return <Pedido />;

  // En modo demostración, /ingreso muestra la pantalla de entrada para revisarla.
  if (esDemo && pathname === '/ingreso') return <Ingreso />;

  if (cargando) return <div className="cargando">Cargando…</div>;
  if (!esDemo && !sesion) return <Ingreso />;
  if (!esDemo && persona === null) return <SinNomina />;
  if (!persona) return <div className="cargando">Cargando…</div>;

  return (
    <Marco>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/partidos" element={<Partidos />} />
        <Route path="/entrenar" element={<Entrenar />} />
        <Route path="/noticias" element={<Noticias />} />
        <Route path="/noticias/nueva" element={<Publicar />} />
        <Route path="/noticias/:id" element={<Publicacion />} />
        <Route path="/mas" element={<Mas />} />
        <Route path="/cuota" element={<Cuota />} />
        <Route path="/compras" element={<Compras />} />
        <Route path="/club" element={<Club />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Marco>
  );
}
