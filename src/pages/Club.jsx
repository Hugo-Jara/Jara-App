import EnConstruccion from '../components/EnConstruccion.jsx';
import { useSesion } from '../lib/sesion.jsx';

export default function Club() {
  const { persona } = useSesion();
  const area = (persona.club?.etiqueta_area || 'Ministerio').toLowerCase();
  return (
    <EnConstruccion
      titulo="Club"
      bajada={`Asambleas y ${area}s: cómo se organiza el club y quién hace qué.`}
      llega="8 de noviembre"
      puntos={[
        ['Asambleas', 'Fecha, tabla de temas, botón al Meet y acta con los acuerdos.'],
        [`Quién es quién`, `Cada ${area} con sus integrantes y en qué está trabajando.`],
      ]}
    />
  );
}
