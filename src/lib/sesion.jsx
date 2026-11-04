import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, esDemo, llamar } from './supabase.js';
import { vaciarPartidos } from './partidos.js';
import { vaciarEntrenamiento } from './entrenamiento.js';
import { vaciarSolicitudes } from './ingreso.js';

const Contexto = createContext(null);
export const useSesion = () => useContext(Contexto);

// Quien llega desde un link del grupo (por ejemplo /partidos) vuelve a esa
// misma pantalla después de entrar.
const aDondeVolver = () => `${window.location.origin}${window.location.pathname}`;

// Quien pide un link o código queda marcado para que, al entrar, la app le
// ofrezca dejar una contraseña. Así crear y recuperar la contraseña son el
// mismo camino y usan el correo que ya llega. Dura un día; si falla el
// navegador (modo privado), simplemente no se ofrece.
const OFRECER_CLAVE = 'jara-ofrecer-clave';
const UN_DIA = 24 * 60 * 60 * 1000;
const leerOferta = () => {
  try {
    const t = Number(localStorage.getItem(OFRECER_CLAVE));
    return !!t && Date.now() - t < UN_DIA;
  } catch { return false; }
};
const guardarOferta = (si) => {
  try {
    if (si) localStorage.setItem(OFRECER_CLAVE, String(Date.now()));
    else localStorage.removeItem(OFRECER_CLAVE);
  } catch { /* sin almacenamiento: no se ofrece */ }
};

const PERSONA_DEMO = {
  id: 'demo',
  nombre: 'Seba',
  esAdmin: true,
  club: { nombre: 'Club Deportivo Hugo Jara', etiqueta_area: 'Ministerio' },
  equipos: [{ id: 'e-sabado', nombre: 'Senior Sábado', encargado: true, tesorero: false }],
  apruebaCompras: true,
  esEncargado: true,
};

const desdeFila = (f) => f && ({
  id: f.id, nombre: f.nombre, esAdmin: f.es_admin, club: f.club, equipos: f.equipos,
  apruebaCompras: f.aprueba_compras, esEncargado: f.es_encargado,
  // Hacienda de prueba ve las pantallas de Hacienda, pero la base no la deja actuar.
  haciendaSoloMirar: !!f.hacienda_solo_mirar,
  editaComunicaciones: !!f.edita_comunicaciones,
  // Solo en cuentas de prueba: { roles, rol, planteles } (migración 0022).
  prueba: f.prueba ?? null,
});

export function ProveedorSesion({ children }) {
  const [cargando, setCargando] = useState(!esDemo);
  const [sesion, setSesion] = useState(null);
  // persona: quién es en la nómina. undefined = todavía no se sabe; null = la
  // base respondió que la cuenta no está enlazada a nadie.
  const [persona, setPersona] = useState(esDemo ? PERSONA_DEMO : undefined);
  // No se pudo preguntar (sin señal, Supabase caído). No es lo mismo que null:
  // no hay que mandar a la persona a buscar su nombre de nuevo.
  const [sinConexion, setSinConexion] = useState(false);
  // Recién entró con link o código: se le ofrece dejar contraseña.
  const [ofrecerClave, setOfrecerClave] = useState(() => !esDemo && leerOferta());

  const cargarPersona = useCallback(async () => {
    try {
      // Si su correo ya estaba cargado en la nómina, queda enlazada sola.
      await llamar('vincular_persona');
      setPersona(desdeFila(await llamar('mi_persona')) ?? null);
      setSinConexion(false);
    } catch {
      setSinConexion(true);
    }
  }, []);

  const reintentar = useCallback(async () => {
    setSinConexion(false);
    await cargarPersona();
  }, [cargarPersona]);

  useEffect(() => {
    if (esDemo) return;
    let vigente = true;
    let cuenta; // la cuenta ya cargada: al volver a la pestaña llega otro SIGNED_IN de la misma
    const aplicar = async (s) => {
      if (!vigente) return;
      setSesion(s);
      const id = s?.user?.id ?? null;
      if (id === cuenta) return;
      cuenta = id;
      vaciarPartidos(); vaciarEntrenamiento(); vaciarSolicitudes();
      setPersona(undefined); setSinConexion(false);
      if (s) await cargarPersona();
      if (vigente) setCargando(false);
    };
    supabase.auth.getSession().then(({ data }) => aplicar(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') aplicar(s);
    });
    return () => {
      vigente = false;
      sub.subscription.unsubscribe();
    };
  }, [cargarPersona]);

  const entrarConGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: aDondeVolver() },
    });

  const entrarConCorreo = (email) => {
    guardarOferta(true);
    setOfrecerClave(true);
    return supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: aDondeVolver() },
    });
  };

  const entrarConClave = async (email, clave) => {
    const r = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: clave });
    if (!r.error) { guardarOferta(false); setOfrecerClave(false); }
    return r;
  };

  // Crea o cambia la contraseña de la cuenta con que se entró (sirve igual
  // para cuentas que entraron con Google o con link).
  const ponerClave = async (clave) => {
    const r = await supabase.auth.updateUser({ password: clave });
    if (!r.error) { guardarOferta(false); setOfrecerClave(false); }
    return r;
  };

  const noOfrecerClave = () => { guardarOferta(false); setOfrecerClave(false); };

  const salir = () => supabase?.auth.signOut();

  return (
    <Contexto.Provider
      value={{
        cargando, sesion, persona, sinConexion, reintentar, esDemo, entrarConGoogle, entrarConCorreo,
        entrarConClave, ponerClave, ofrecerClave, noOfrecerClave, salir, recargarPersona: cargarPersona,
      }}
    >
      {children}
    </Contexto.Provider>
  );
}
