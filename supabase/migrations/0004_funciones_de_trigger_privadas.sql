-- Jara App · 0004 · Las funciones de trigger no se llaman desde la app
--
-- Postgres deja ejecutar toda función nueva a cualquier rol. Estas cinco solo
-- las dispara la base, así que se les quita el acceso por la API.

revoke execute on function public.proteger_email_contacto()        from public, anon, authenticated;
revoke execute on function public.solicitud_antes_de_insertar()    from public, anon, authenticated;
revoke execute on function public.solicitud_antes_de_actualizar()  from public, anon, authenticated;
revoke execute on function public.solicitud_registrar_evento()     from public, anon, authenticated;
revoke execute on function public.adjunto_antes_de_insertar()      from public, anon, authenticated;
