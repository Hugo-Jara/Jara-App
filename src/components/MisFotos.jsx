import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { esDemo } from '../lib/supabase.js';
import { estadoCaras, activarCaras, apagarCaras, misFotos, noSoyYo, mostrarEnPerfil } from '../lib/caras.js';
import { fuente, otraVez, Visor } from './FotosDelPartido.jsx';
import { fechaLarga } from '../lib/fechas.js';
import { plural } from '../lib/texto.js';

const PRIMERAS = 9;

// Perfil > Mis fotos: "Buscarme en las fotos" (0042). Se activa con permiso,
// usa la foto de perfil y se apaga cuando quieras (borra todo).
export default function MisFotos({ tieneFoto }) {
  const [estado, setEstado] = useState(null);
  const [fotos, setFotos] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [mayor, setMayor] = useState(false);
  const [mostrar, setMostrar] = useState(true);
  const [todas, setTodas] = useState(false);
  const [abierta, setAbierta] = useState(null);

  // silencioso: las revisiones de fondo no muestran error (el celular corta la
  // red cuando la pantalla se apaga o la app queda atrás).
  const cargar = async (silencioso = false) => {
    try {
      const e = await estadoCaras();
      const f = e.activa ? await misFotos() : null;
      setEstado(e);
      setFotos(f);
      setError('');
    } catch (x) { if (!silencioso) setError(x.message); }
  };
  useEffect(() => { cargar(); }, [tieneFoto]); // eslint-disable-line react-hooks/exhaustive-deps
  // Mientras está pendiente, se vuelve a mirar cada minuto, solo con la app a la vista.
  useEffect(() => {
    if (estado?.activa && estado.estado === 'pendiente') {
      const t = setInterval(() => { if (document.visibilityState === 'visible') cargar(true); }, esDemo ? 5000 : 60000);
      return () => clearInterval(t);
    }
  }, [estado]); // eslint-disable-line react-hooks/exhaustive-deps

  const hacer = (accion) => async () => {
    setOcupado(true); setError('');
    try { await accion(); await cargar(); setAbriendo(false); setMayor(false); }
    catch (x) { setError(x.message); }
    setOcupado(false);
  };
  const apagar = () => {
    if (!window.confirm('¿Dejar de buscarte en las fotos? Se borra tu huella de la cara y todas las fotos encontradas.')) return;
    hacer(apagarCaras)();
  };
  const esconder = async (foto) => {
    try {
      await noSoyYo(foto.id);
      setAbierta(null);
      setFotos((f) => f.filter((x) => x.id !== foto.id));
    } catch (x) { setError(x.message); }
  };

  if (!estado) {
    return (
      <div className="card perfil-fotos">
        <div className="item-que">Mis fotos</div>
        {error ? <p className="error" role="alert">{error}</p> : <p className="item-meta">Cargando…</p>}
      </div>
    );
  }

  // Apagado: explicar y pedir permiso.
  if (!estado.activa) {
    return (
      <div className="card perfil-fotos">
        <div className="item-que">Mis fotos</div>
        <p className="item-meta">
          La app puede buscarte en las fotos que el fotógrafo de la liga sube de cada partido, comparando tu cara con tu foto de perfil.
        </p>
        {!abriendo ? (
          <button type="button" className="btn secundario" style={{ marginTop: 14 }} onClick={() => setAbriendo(true)}>
            Buscarme en las fotos
          </button>
        ) : (
          <div className="caras-permiso">
            <p className="item-meta">Antes de activarlo, lo importante:</p>
            <ul className="caras-lista">
              <li>Se saca una huella de tu cara (una lista de números) desde tu foto de perfil y se compara con las fotos de la liga.</li>
              <li>Solo se guarda en qué fotos sales. De las demás caras no se guarda nada.</li>
              <li>Tú eliges si tus fotos encontradas se ven en tu perfil para el resto del club o si solo las ves tú. Lo cambias cuando quieras.</li>
              <li>Lo apagas cuando quieras y se borra todo al tiro.</li>
            </ul>
            {!tieneFoto && <p className="error" role="alert">Primero pon una foto de perfil donde se te vea bien la cara.</p>}
            <label className="casilla">
              <input type="checkbox" checked={mayor} onChange={(e) => setMayor(e.target.checked)} />
              Tengo 18 años o más y acepto que me busquen en las fotos
            </label>
            <label className="casilla">
              <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} />
              Mostrar en mi perfil las fotos donde salgo
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="caras-botones">
              <button type="button" className="btn" disabled={!mayor || !tieneFoto || ocupado} onClick={hacer(async () => { await activarCaras(mayor); if (mostrar) await mostrarEnPerfil(true); })}>
                {ocupado ? 'Activando…' : 'Activar'}
              </button>
              <button type="button" className="enlace" onClick={() => { setAbriendo(false); setMayor(false); setError(''); }}>Ahora no</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const visibles = fotos ? (todas ? fotos : fotos.slice(0, PRIMERAS)) : [];
  const aviso = {
    pendiente: 'Te estamos buscando. La búsqueda corre sola cada 3 horas y la primera tarda unos 20 minutos: vuelve más tarde.',
    sin_cara: 'No encontramos una cara clara en tu foto de perfil. Cambia la foto por una de frente y con buena luz.',
    sin_foto: 'Quitaste tu foto de perfil: pon una para que te sigamos buscando.',
  }[estado.estado];

  return (
    <div className="card perfil-fotos">
      <div className="item-que">Mis fotos{fotos?.length ? ` · ${fotos.length}` : ''}</div>
      {aviso && <p className="item-meta">{aviso}</p>}
      {estado.foto_cambio && estado.estado === 'lista' && <p className="item-meta">Cambiaste tu foto de perfil: en la próxima búsqueda te buscamos con la nueva.</p>}
      {estado.estado === 'lista' && fotos?.length === 0 && (
        <p className="item-meta">Todavía no apareces en las fotos de la liga. Cuando suban fotos nuevas te volvemos a buscar.</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {fotos?.length > 0 && (
        <div className="fotos-grilla" style={{ marginTop: 12 }}>
          {visibles.map((f, i) => (
            <button key={f.id} className="fotos-miniatura" onClick={() => setAbierta(i)} aria-label={`Ver foto ${i + 1}`}>
              <img src={fuente(f.id, 400)} onError={otraVez(f.id, 400)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {fotos?.length > PRIMERAS && !todas && (
        <button className="btn secundario" style={{ marginTop: 12 }} onClick={() => setTodas(true)}>Ver las {plural(fotos.length, 'foto', 'fotos')}</button>
      )}
      <p className="nota" style={{ textAlign: 'left' }}>
        {estado.muestra ? 'Se ven en tu perfil para el resto del club' : 'Solo tú ves tus fotos'}
        {' · '}<button type="button" className="enlace" disabled={ocupado} onClick={hacer(() => mostrarEnPerfil(!estado.muestra))}>
          {estado.muestra ? 'Ocultarlas' : 'Mostrarlas en mi perfil'}
        </button>
      </p>
      <p className="nota" style={{ textAlign: 'left' }}>
        Buscarme en las fotos está activado · <button type="button" className="enlace quitar" disabled={ocupado} onClick={apagar}>Apagar y borrar</button>
      </p>
      {abierta != null && fotos?.[abierta] && (
        <Visor
          fotos={fotos} indice={abierta} cambiar={setAbierta} cerrar={() => setAbierta(null)}
          extra={(f) => (
            <span className="caras-visor-dato">
              {f.partidoId
                ? <Link className="enlace" to={`/partidos/${f.partidoId}`}>{f.equipo} vs {f.rival}{f.partidoFecha ? ` · ${fechaLarga(f.partidoFecha)}` : ''}</Link>
                : <span>{f.carpetaNombre}</span>}
              {' · '}<button type="button" className="enlace quitar" onClick={() => esconder(f)}>No soy yo</button>
            </span>
          )}
        />
      )}
    </div>
  );
}
