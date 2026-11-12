import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { esDemo } from '../lib/supabase.js';
import { leerPerfil } from '../lib/perfil.js';

// Inicio: a quien todavía no pone foto ni posición se le invita a completar su
// perfil. Se va sola cuando lo completa o con "Ahora no"; desde ahí no se
// vuelve a preguntar a la base en este aparato.
const VISTA = 'jara-bienvenida-vista';
const yaVista = () => { try { return localStorage.getItem(VISTA) === '1'; } catch { return false; } };
const marcarVista = () => { try { localStorage.setItem(VISTA, '1'); } catch { /* sin almacenamiento */ } };

export default function Bienvenida() {
  const [mostrar, setMostrar] = useState(false);
  useEffect(() => {
    if (esDemo || yaVista()) return undefined;
    let vigente = true;
    leerPerfil().then((p) => {
      if (!vigente) return;
      if (p.foto_ruta || p.posicion) marcarVista();
      else setMostrar(true);
    }).catch(() => {});
    return () => { vigente = false; };
  }, []);
  if (!mostrar) return null;
  return (
    <section className="card accion aviso">
      <div className="sobretitulo">Ya estás en la Jara App</div>
      <p className="accion-dato">Pon tu foto y tu posición para que el plantel te reconozca. Es un minuto.</p>
      <div className="botones">
        <Link className="btn" to="/perfil" onClick={marcarVista}>Completar perfil</Link>
        <button className="btn secundario" onClick={() => { marcarVista(); setMostrar(false); }}>Ahora no</button>
      </div>
    </section>
  );
}
