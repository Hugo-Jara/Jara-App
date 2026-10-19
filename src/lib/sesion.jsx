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

  const entrarConCorreo = (email) =>
    supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: aDondeVolver() },
    });

  const salir = () => supabase?.auth.signOut();

  return (
    <Contexto.Provider
      value={{ cargando, sesion, persona, sinConexion, reintentar, esDemo, entrarConGoogle, entrarConCorreo, salir, recargarPersona: cargarPersona }}
    >
      {children}
    </Contexto.Provider>
  );
}
