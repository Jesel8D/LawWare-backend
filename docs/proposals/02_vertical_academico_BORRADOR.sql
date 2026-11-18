-- BORRADOR NO APROBADO. Solo para revisión y pruebas en BD desechable aislada.
-- No aplicar a bases persistentes ni producción sin revisión y autorización.
BEGIN;
CREATE OR REPLACE VIEW lawware.v_lecciones_publicadas WITH (security_barrier=true) AS
 SELECT v.id_leccion_version,v.id_leccion,v.numero_version,v.titulo,v.contenido,
        m.id_modulo,l.orden
 FROM lawware.leccion_version v JOIN lawware.leccion l USING(id_leccion)
 JOIN lawware.modulo m ON m.id_modulo=l.id_modulo
 WHERE v.estado='PUBLICADA' AND l.estado_general='ACTIVO' AND m.estado='PUBLICADO';

-- Exponer exclusivamente el RBAC del actor establecido por backend autenticado.
-- app.user_id no es identidad fuerte frente a SQL arbitrario.
CREATE FUNCTION lawware.fn_permisos_propios()
RETURNS TABLE(rol_codigo text, permiso_codigo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,lawware,pg_temp AS $fn$
 SELECT r.codigo::text, p.codigo::text
 FROM lawware.usuario_rol ur
 JOIN lawware.usuario u ON u.id_usuario=ur.id_usuario AND u.estado='ACTIVO'
 JOIN lawware.rol r ON r.id_rol=ur.id_rol AND r.estado='ACTIVO'
 LEFT JOIN lawware.rol_permiso rp ON rp.id_rol=r.id_rol
 LEFT JOIN lawware.permiso p ON p.id_permiso=rp.id_permiso AND p.estado='ACTIVO'
 WHERE ur.id_usuario=lawware.fn_app_user_id() AND ur.estado='ACTIVO'
   AND ur.fecha_asignacion<=statement_timestamp()
   AND (ur.fecha_fin IS NULL OR ur.fecha_fin>statement_timestamp())
$fn$;
REVOKE ALL ON FUNCTION lawware.fn_permisos_propios() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lawware.fn_permisos_propios() TO lawware_app, lawware_progress_service;
-- Mantiene bloqueados módulo, lección y versión hasta concluir la transacción
-- para evitar que una retirada concurrente se salte la comprobación.
CREATE FUNCTION lawware.fn_bloquear_leccion_publicada(p_version uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,lawware,pg_temp AS $fn$
DECLARE encontrada boolean;
BEGIN
 IF lawware.fn_app_user_id() IS NULL THEN RETURN false; END IF;
 SELECT true INTO encontrada
 FROM lawware.leccion_version v JOIN lawware.leccion l USING(id_leccion)
 JOIN lawware.modulo m ON m.id_modulo=l.id_modulo
 WHERE v.id_leccion_version=p_version AND v.estado='PUBLICADA'
   AND l.estado_general='ACTIVO' AND m.estado='PUBLICADO'
 FOR SHARE OF v,l,m;
 RETURN COALESCE(encontrada,false);
END $fn$;
REVOKE ALL ON FUNCTION lawware.fn_bloquear_leccion_publicada(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lawware.fn_bloquear_leccion_publicada(uuid) TO lawware_progress_service;
CREATE VIEW lawware.v_avisos_vigentes WITH (security_barrier=true) AS
 SELECT id_aviso,tipo_aviso,version,contenido,fecha_vigencia
 FROM lawware.aviso_privacidad WHERE estado='VIGENTE' AND (fecha_vigencia IS NULL OR fecha_vigencia<=statement_timestamp());
CREATE VIEW lawware.v_finalidades_aviso_vigente WITH (security_barrier=true) AS
 SELECT af.id_aviso, f.id_finalidad,f.nombre,f.descripcion,af.es_necesaria_servicio,af.requiere_consentimiento,af.orden
 FROM lawware.aviso_finalidad af JOIN lawware.finalidad_tratamiento f USING(id_finalidad)
 JOIN lawware.aviso_privacidad a USING(id_aviso)
 WHERE a.estado='VIGENTE' AND (a.fecha_vigencia IS NULL OR a.fecha_vigencia<=statement_timestamp());
GRANT SELECT ON lawware.v_avisos_vigentes,lawware.v_finalidades_aviso_vigente TO lawware_app;
COMMIT;
