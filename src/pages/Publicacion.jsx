import { Link, useParams } from 'react-router-dom';
import { useNoticias, TIPOS } from '../lib/noticias.js';
import Carrusel from '../components/Carrusel.jsx';

function compartir(p) {
  const texto = `${p.titulo}. Léelo en Jara App:`;
  const url = window.location.href;
  if (navigator.share) {
    navigator.share({ title: p.titulo, text: texto, url }).catch(() => {});
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`, '_blank', 'noopener');
  }
}

function Boletin({ p }) {
  return p.notas.map((n, i) => (
    <article className="articulo" key={i}>
      <h2 className="nota-titulo">{n.titulo}</h2>
      <Carrusel fotos={n.fotos} />
      <p className="nota-texto">{n.texto}</p>
    </article>
  ));
}

function Entrevista({ p }) {
  return (
    <>
      <Carrusel fotos={p.fotos} />
      <dl className="ficha">
        {p.ficha.map(([etiqueta, valor]) => (
          <div key={etiqueta}><dt>{etiqueta}</dt><dd>{valor}</dd></div>
        ))}
      </dl>
      {p.secciones.map((s) => (
        <section key={s.titulo}>
          <h2 className="nota-titulo">{s.titulo}</h2>
          <dl className="preguntas">
            {s.preguntas.map(([pregunta, respuesta]) => (
              <div key={pregunta}><dt>{pregunta}</dt><dd>{respuesta}</dd></div>
            ))}
          </dl>
        </section>
      ))}
    </>
  );
}

function Aviso({ p }) {
  return (
    <>
      <Carrusel fotos={p.fotos} />
      {p.vence && <p className="vence grande">{p.vence}</p>}
      <p className="nota-texto">{p.texto}</p>
    </>
  );
}

export default function Publicacion() {
  const { id } = useParams();
  const { publicaciones } = useNoticias();
  const p = publicaciones.find((x) => x.id === id);

  if (!p) {
    return (
      <>
        <Link to="/noticias" className="volver">← Noticias</Link>
        <p className="vacio suelto">Esta publicación ya no está disponible.</p>
      </>
    );
  }
  const Cuerpo = { boletin: Boletin, entrevista: Entrevista, aviso: Aviso }[p.tipo];
  return (
    <>
      <Link to="/noticias" className="volver">← Noticias</Link>
      <div className="sobretitulo">{TIPOS[p.tipo]} · {p.fecha}</div>
      <h1 className="titulo display">{p.titulo}</h1>
      {p.bajada && <p className="subtitulo">{p.bajada}</p>}
      <Cuerpo p={p} />
      <button className="btn secundario compartir" onClick={() => compartir(p)}>Compartir por WhatsApp</button>
    </>
  );
}
