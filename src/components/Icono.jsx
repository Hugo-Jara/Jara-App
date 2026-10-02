// Íconos de línea, dibujados a mano para no cargar una librería.
const TRAZOS = {
  inicio: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
  partidos: <><circle cx="12" cy="12" r="9" /><path d="M12 7l4.5 3.3-1.7 5.2H9.2L7.5 10.3z" /></>,
  cuota: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M7 15h4" /></>,
  compras: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>,
  club: <><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.900 1.900 6.500 5.500" /><circle cx="17" cy="9" r="2.4" /><path d="M17.500 14.300c2.200.400 3.600 1.900 4 4.200" /></>,
  asambleas: <><rect x="3" y="6" width="13" height="12" rx="2.500" /><path d="M16 10.500l5-3v9l-5-3z" /></>,
  entrenar: <><circle cx="12" cy="14" r="7" /><path d="M12 14V10.500M9.500 3h5M12 3v4" /></>,
  noticias: <><rect x="3" y="5" width="18" height="14" rx="2.500" /><path d="M7 9.500h6M7 13h10M7 16h7" /></>,
  mas: <><rect x="4" y="4" width="6.500" height="6.500" rx="1.500" /><rect x="13.500" y="4" width="6.500" height="6.500" rx="1.500" /><rect x="4" y="13.500" width="6.500" height="6.500" rx="1.500" /><rect x="13.500" y="13.500" width="6.500" height="6.500" rx="1.500" /></>,
  flecha: <path d="M9 6l6 6-6 6" />,
};

export default function Icono({ nombre, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRAZOS[nombre]}
    </svg>
  );
}
