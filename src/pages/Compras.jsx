import EnConstruccion from '../components/EnConstruccion.jsx';

export default function Compras() {
  return (
    <EnConstruccion
      titulo="Compras"
      bajada="Ninguna compra se paga sin cotización aprobada por Hacienda."
      llega="19 de octubre"
      puntos={[
        ['Creas la solicitud', 'Qué se compra, para qué, monto, cotización adjunta y referencia.'],
        ['Hacienda revisa', 'Aprueba, o la devuelve con el motivo para que la corrijas.'],
        ['Se hace la compra', 'Subes la boleta desde el celular.'],
        ['Queda en tesorería', 'Con el registro de quién pidió, quién aprobó y cuándo.'],
      ]}
    />
  );
}
