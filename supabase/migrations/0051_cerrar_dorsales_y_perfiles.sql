-- 0051 · Auditoría antes del lanzamiento: cerrar dos tablas que quedaron
-- con los permisos que Supabase da por defecto a toda tabla nueva.
--
-- `perfiles` y `dorsales` (0028) son las únicas tablas a las que no se les
-- quitaron esos permisos. Hoy nadie puede leerlas ni escribirlas directo,
-- porque tienen seguridad por fila encendida y ninguna regla que deje pasar;
-- pero el resto de las tablas tiene además los permisos quitados, y estas
-- dos quedan igual. La app no cambia: todo pasa por funciones (perfil_ver,
-- perfil_guardar, planteles_ver...), que no dependen de estos permisos.
--
-- Se puede correr más de una vez sin problema.

revoke all on public.perfiles, public.dorsales from anon, authenticated;
