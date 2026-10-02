// Abre WhatsApp con un recordatorio listo para mandar al grupo. El mensaje
// lleva el link a esta pantalla: quien lo toca responde en la app.
export default function RecordarPorWhatsApp({ mensaje }) {
  const url = `${window.location.origin}${window.location.pathname}`;
  return (
    <a className="btn secundario" target="_blank" rel="noopener noreferrer"
       href={`https://wa.me/?text=${encodeURIComponent(mensaje(url))}`}>
      Recordar por WhatsApp
    </a>
  );
}
