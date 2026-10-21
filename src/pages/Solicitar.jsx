import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTopico } from '../lib/solicitud.js';
import { SIN_CONEXION } from '../lib/supabase.js';
import { ESCUDO } from '../lib/base.js';
import { Formulario } from './Pedido.jsx';

// Página suelta, sin cuenta: se entra con el link de un tópico y solo se puede
// enviar una solicitud de compra. No muestra ninguna solicitud.
export default function Solicitar() {
  const token = useLocation().pathname.split('/')[2] || '';
  const { cargando, error, topico, recargar, enviar } = useTopico(token);
  const [enviada, setEnviada] = useState(false);
  const [reintentando, setReintentando] = useState(false);
  const reintentar = async () => { setReintentando(true); await recargar(); setReintentando(false); };

  if (cargando) return <div className="cargando">Cargando…</div>;
  if (!topico) {
    return (
      <div className="pagina suelta">
        {error === SIN_CONEXION
          ? (
            <>
              <p className="vacio" role="alert">No pudimos conectar con el club. Revisa tu señal.</p>
              <button className="btn" disabled={reintentando} onClick={reintentar}>{reintentando ? 'Reintentando…' : 'Reintentar'}</button>
            </>
          )
          : <p className="vacio">{error || 'Este link no es válido.'} Pídele el link de nuevo a quien te lo mandó.</p>}
      </div>
    );
  }
  return (
    <div className="pagina suelta">
      <header className="barra">
        <img src={ESCUDO} alt="Escudo del Club Hugo Jara" />
        <div className="barra-texto">
          <div className="barra-nombre display">Compras</div>
          <div className="barra-sub">{topico.nombre} · Club Deportivo Hugo Jara</div>
        </div>
      </header>
      {enviada ? (
        <section className="card" role="status">
          <div className="sobretitulo">Solicitud enviada</div>
          <h2 className="accion-titulo">Recibimos tu solicitud</h2>
          <p className="accion-dato tenue">Si hay algún problema con tu solicitud, te contactamos.</p>
          <div className="botones">
            <button className="btn secundario" onClick={() => setEnviada(false)}>Enviar otra solicitud</button>
          </div>
        </section>
      ) : (
        <>
          <p className="subtitulo">Cuéntanos qué necesitas comprar. Hacienda la revisa y te avisa.</p>
          <Formulario enviarTexto="Enviar solicitud" ocultarCancelar
                      onGuardar={async (d) => { await enviar(d); setEnviada(true); }} />
        </>
      )}
    </div>
  );
}
