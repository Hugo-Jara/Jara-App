import EnConstruccion from '../components/EnConstruccion.jsx';

export default function Cuota() {
  return (
    <EnConstruccion
      titulo="Mi cuota"
      bajada="Tu estado de pago, visible solo para ti, tu tesorero y Hacienda."
      llega="8 de noviembre"
      puntos={[
        ['Estado al día', 'Qué meses tienes pagados y cuáles pendientes.'],
        ['Fechas de pago', 'Cuánto y cuándo vence la próxima cuota.'],
      ]}
    />
  );
}
