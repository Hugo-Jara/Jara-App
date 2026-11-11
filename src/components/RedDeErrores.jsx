import { Component } from 'react';
import { BASE, ESCUDO } from '../lib/base.js';

// Si una pantalla falla al dibujarse, React la saca entera y queda todo en
// negro. Esta red la ataja y ofrece volver, en vez de dejar a la persona sin nada.
export default class RedDeErrores extends Component {
  state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  componentDidCatch(error) {
    console.error('La pantalla falló:', error);
  }

  render() {
    if (!this.state.fallo) return this.props.children;
    return (
      <div className="ingreso">
        <img className="escudo" src={ESCUDO} alt="Escudo del Club Hugo Jara" />
        <h1 className="titulo display">Algo falló</h1>
        <p className="subtitulo">
          Esta pantalla tuvo un problema. Lo que ya guardaste no se pierde. Vuelve a cargar la app; si sigue pasando,
          avísale a quien administra la app y cuéntale qué estabas haciendo.
        </p>
        <button className="btn" onClick={() => window.location.reload()}>Volver a cargar</button>
        <button className="btn secundario" style={{ marginTop: 10 }} onClick={() => window.location.assign(BASE)}>Ir al inicio</button>
      </div>
    );
  }
}
