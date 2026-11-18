-- CANDIDATA NO APROBADA. Solo para revisión y bases desechables locales.
-- Requiere LawWare v2.1: la identificación siguiente es estructural y parcial,
-- no una prueba criptográfica de la versión ni un sustituto del historial.
-- No introduce vistas, grants ni reglas nuevas de privacidad.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('lawware:migraciones_esquema',0));

DO $preflight$
DECLARE
  ledger oid := to_regclass('lawware.migraciones_esquema');
  view_cols text[];
  ledger_cols text[];
  already_applied boolean;
  missing_relation text;
BEGIN
  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='LAWWARE_UNSUPPORTED_POSTGRESQL';
  END IF;
  IF current_database() IN ('postgres','template0','template1') THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='LAWWARE_INVALID_DATABASE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='lawware' AND pg_get_userbyid(nspowner)=current_user) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='LAWWARE_SCHEMA_OWNER_REQUIRED';
  END IF;
  IF ledger IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=ledger AND relkind='r' AND pg_get_userbyid(relowner)=current_user) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='LAWWARE_MIGRATION_LEDGER_INCOMPATIBLE';
    END IF;
    SELECT array_agg(a.attname::text || ':' || format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum)
      INTO ledger_cols FROM pg_attribute a WHERE a.attrelid=ledger AND a.attnum>0 AND NOT a.attisdropped;
    IF ledger_cols IS DISTINCT FROM ARRAY['version:text','base_requerida:text','aplicada_en:timestamp with time zone']
       OR (SELECT count(*) FROM pg_attribute a WHERE a.attrelid=ledger AND a.attnum>0 AND NOT a.attisdropped AND a.attnotnull)<>3
       OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=ledger AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (version)') THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='LAWWARE_MIGRATION_LEDGER_INCOMPATIBLE';
    END IF;
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM lawware.migraciones_esquema WHERE version=$1)'
      INTO already_applied USING 'v2.1/03_vertical_academico';
    IF already_applied THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='LAWWARE_MIGRATION_ALREADY_APPLIED: v2.1/03_vertical_academico';
    END IF;
  END IF;
  SELECT name INTO missing_relation FROM unnest(ARRAY['usuario','rol','permiso','usuario_rol','rol_permiso','modulo','leccion','leccion_version','avance_leccion']) AS required(name)
    WHERE to_regclass(format('lawware.%I',name)) IS NULL LIMIT 1;
  IF missing_relation IS NOT NULL OR to_regprocedure('lawware.fn_app_user_id()') IS NULL
     OR to_regprocedure('lawware.fn_vincular_prerregistro(uuid,uuid,text)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('lawware.aviso_presentacion') AND attname='hash_token_vinculacion' AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('lawware.consentimiento') AND tgname='tr_consentimiento_completo' AND NOT tgisinternal) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='LAWWARE_BASE_V21_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['usuario','rol','permiso','usuario_rol','rol_permiso','modulo','leccion','leccion_version','avance_leccion']) AS required(name)
      JOIN pg_class c ON c.oid=to_regclass(format('lawware.%I',required.name))
      WHERE c.relkind<>'r' OR pg_get_userbyid(c.relowner)<>current_user) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='LAWWARE_TABLE_OWNER_REQUIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('lawware.v_lecciones_publicadas') AND relkind='v' AND pg_get_userbyid(relowner)=current_user) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='LAWWARE_CANONICAL_VIEW_REQUIRED';
  END IF;
  SELECT array_agg(a.attname::text || ':' || format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum)
    INTO view_cols FROM pg_attribute a WHERE a.attrelid='lawware.v_lecciones_publicadas'::regclass AND a.attnum>0 AND NOT a.attisdropped;
  IF view_cols IS DISTINCT FROM ARRAY['id_leccion_version:uuid','id_leccion:uuid','numero_version:integer','titulo:character varying(180)','contenido:text'] THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='LAWWARE_CANONICAL_VIEW_INCOMPATIBLE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lawware_app') OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lawware_progress_service') THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='LAWWARE_TECHNICAL_ROLES_REQUIRED';
  END IF;
  IF to_regclass('lawware.v_lecciones_academicas') IS NOT NULL
     OR to_regprocedure('lawware.fn_permisos_propios()') IS NOT NULL
     OR to_regprocedure('lawware.fn_bloquear_leccion_publicada(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='LAWWARE_MIGRATION_OBJECT_CONFLICT';
  END IF;
  IF ledger IS NULL THEN
    CREATE TABLE lawware.migraciones_esquema (
      version text PRIMARY KEY,
      base_requerida text NOT NULL,
      aplicada_en timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    REVOKE ALL ON TABLE lawware.migraciones_esquema FROM PUBLIC;
  END IF;
END $preflight$;

-- Nueva vista: conserva intacto el contrato público de cinco columnas existente.
CREATE VIEW lawware.v_lecciones_academicas WITH (security_barrier=true) AS
 SELECT v.id_leccion_version,v.id_leccion,v.numero_version,v.titulo,v.contenido,
        l.id_modulo,l.orden
 FROM lawware.v_lecciones_publicadas v JOIN lawware.leccion l USING(id_leccion);
GRANT SELECT ON lawware.v_lecciones_academicas TO lawware_app;

-- La identidad es establecida por backend; app.user_id no es identidad fuerte.
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

INSERT INTO lawware.migraciones_esquema(version,base_requerida)
VALUES ('v2.1/03_vertical_academico','v2.1 (marcadores estructurales parciales)');
COMMIT;
