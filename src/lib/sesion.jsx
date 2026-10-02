import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, esDemo } from './supabase.js';

const Contexto = createContext(null);
export const useSesion = () => useContext(Contexto);

// Quien llega desde un link del grupo (por ejemplo /partidos) vuelve a esa
// misma pantalla después de entrar.
const aDondeVolver = () => `${window.location.origin}${window.location.pathname}`;

const PERSONA_DEMO = {
  id: 'demo',
  nombre: 'Seba',
  es_admin: true,
  estado: 'activo',
  club: { nombre: 'Club Deportivo Hugo Jara', etiqueta_area: 'Ministerio' },
  apruebaCompras: true,
};

export function ProveedorSesion({ children }) {
  const [cargando, setCargando] = useState(!esDemo);
  const [sesion, setSesion] = useState(null);
  // persona: fila de la nómina enlazada a la cuenta. null = el correo no está en la nómina.
  const [persona, setPersona] = useState(esDemo ? PERSONA_DEMO : undefined);

  const cargarPersona = useCallback(async () => {
    const { data: personaId, error } = await supabase.rpc('vincular_persona');
    if (error || !personaId) {
      setPersona(null);
      return;
    }
    const [{ data: fila }, { data: aprueba }] = await Promise.all([
      supabase
        .from('personas')
        .select('id, nombre, es_admin, estado, club:clubes(nombre, etiqueta_area)')
        .eq('id', personaId)
        .single(),
      supabase.rpc('puedo_aprobar_compras'),
    ]);
    setPersona(fila ? { ...fila, apruebaCompras: !!aprueba } : null);
  }, []);

  useEffect(() => {
    if (esDemo) return;
    let vigente = true;
    const aplicar = async (s) => {
      if (!vigente) return;
      setSesion(s);
      if (s) await cargarPersona();
      else setPersona(undefined);
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
      value={{ cargando, sesion, persona, esDemo, entrarConGoogle, entrarConCorreo, salir }}
    >
      {children}
    </Contexto.Provider>
  );
}
