import { Link } from 'react-router-dom';
import { ESCUDO } from '../lib/base.js';

// Página pública para quien no es del club (el "invitado"): se abre sin cuenta.
// Es solo texto escrito aquí: no consulta la base, así que no muestra nombres
// de socios, fotos, boletín, resultados por persona ni nada de tesorería.
// Para cambiar lo que dice, se edita este archivo.

const PLANTELES = [
  ['Senior Sábado', 'Juega su liga los sábados.'],
  ['Senior Jueves', 'Juega su liga los jueves en la noche.'],
  ['Junior Sábado', 'El plantel joven del club. Juega los sábados.'],
];

const PRIVACIDAD = 'https://hugojara.cl/privacidad';

export default function ConoceElClub() {
  return (
    <div className="ingreso publica">
      <img className="escudo" src={ESCUDO} alt="Escudo del Club Hugo Jara" />
      <h1 className="titulo display">Club Deportivo Hugo Jara</h1>
      <p className="subtitulo">Un club de fútbol amateur que este año cumple 20 años jugando juntos.</p>

      <section className="card">
        <div className="sobretitulo">Nuestros planteles</div>
        <ul className="publica-lista">
          {PLANTELES.map(([nombre, texto]) => (
            <li key={nombre}><strong>{nombre}</strong><span>{texto}</span></li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="sobretitulo">Entrenamientos</div>
        <p className="publica-texto">
          El club arma listas de entrenamiento durante la semana. Los socios se inscriben desde la app.
          Si quieres probar, pídele a un socio que te sume a la lista como su invitado.
        </p>
      </section>

      <section className="card">
        <div className="sobretitulo">¿Quieres ser parte?</div>
        <p className="publica-texto">
          Habla con alguien del club que conozcas. Si ya eres socio o jugador, entra con tu correo,
          busca tu nombre y pide tu pase: Tesorería del club te lo aprueba.
        </p>
        <Link className="btn" to="/" style={{ marginTop: 16 }}>Entrar a la app</Link>
      </section>

      <p className="nota">
        Esta página es pública. Los nombres, fotos y datos de los socios solo se ven dentro de la app.{' '}
        <a className="enlace" href={PRIVACIDAD} target="_blank" rel="noopener noreferrer">Privacidad</a>
      </p>
    </div>
  );
}
