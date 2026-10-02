// Pantalla provisoria de un módulo que todavía no se construye: dice qué va a
// tener y cuándo, para que quien pruebe la app sepa qué esperar.
export default function EnConstruccion({ titulo, bajada, llega, puntos }) {
  return (
    <>
      <h1 className="titulo display">{titulo}</h1>
      <p className="subtitulo">{bajada}</p>
      <div className="card">
        <div className="etiqueta" style={{ display: 'inline-block', marginBottom: 14 }}>Llega el {llega}</div>
        <ol className="pasos">
          {puntos.map(([principal, detalle]) => (
            <li key={principal}>
              <div>
                {principal}
                {detalle && <small>{detalle}</small>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
