import { useState } from 'react';
import { AvisosNoticias } from '../components/avisos/Avisos.jsx';
import BoletinModulo from '../components/boletin/BoletinModulo.jsx';
import { Link, useSearchParams } from 'react-router-dom';
import { useNoticias, TIPOS, portada } from '../lib/noticias.js';
import { Foto } from '../components/Carrusel.jsx';

export default function Noticias() {
  const { publicaciones, puedePublicar } = useNoticias();
  const [params] = useSearchParams();
  const [filtro, setFiltro] = useState(() => params.get('tab') === 'aviso' ? 'aviso' : 'boletin');
  if (params.has('editor') || params.has('edicion')) return <BoletinModulo />;
  const visibles = publicaciones.filter((p) => p.tipo !== 'boletin' && p.tipo !== 'aviso' && (filtro === 'todo' || p.tipo === filtro));

  return (
    <>
      <div className="titulo-fila">
        <h1 className="titulo display">Noticias del Jara</h1>
        {puedePublicar && <Link to="/noticias/nueva" className="btn chico">Publicar</Link>}
      </div>

      <div className="filtros" role="tablist" aria-label="Tipo de publicación">
        {[['todo', 'Todo'], ...Object.entries(TIPOS).map(([k, v]) => [k, k === 'boletin' ? 'El Jara Informa' : k === 'aviso' ? 'Avisos' : v])].map(([clave, texto]) => (
          <button key={clave} role="tab" aria-selected={filtro === clave}
                  className={`filtro ${filtro === clave ? 'activo' : ''}`} onClick={() => setFiltro(clave)}>
            {texto}
          </button>
        ))}
      </div>

      {(filtro === 'todo' || filtro === 'boletin') && <BoletinModulo />}

      {(filtro === 'todo' || filtro === 'aviso') && <AvisosNoticias soloAvisos={filtro === 'aviso'} />}

      {filtro === 'entrevista' && visibles.length === 0 && <p className="vacio suelto">Todavía no hay publicaciones acá.</p>}

      {visibles.map((p) => {
        const foto = portada(p);
        return (
          <Link key={p.id} to={`/noticias/${p.id}`} className="card pub">
            {foto && <Foto foto={foto} className="pub-portada" />}
            <div className="pub-cuerpo">
              <div className="sobretitulo">
                {TIPOS[p.tipo]} · {p.fecha}
                {p.vence && <span className="vence">{p.vence}</span>}
              </div>
              <div className="pub-titulo">{p.titulo}</div>
              {p.bajada && <div className="pub-bajada">{p.bajada}</div>}
            </div>
          </Link>
        );
      })}
    </>
  );
}
