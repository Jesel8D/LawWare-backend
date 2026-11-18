-- Datos sintéticos exclusivamente para el laboratorio académico autorizado.
-- No contiene permisos administrativos ni reglas de privacidad.
INSERT INTO lawware.rol(id_rol,codigo,nombre,descripcion,estado) VALUES
 ('91000000-0000-4000-8000-000000000001','ACADEMICO_PRUEBA','Académico de prueba','Laboratorio sintético','ACTIVO');
INSERT INTO lawware.permiso(id_permiso,codigo,nombre,descripcion) VALUES
 ('92000000-0000-4000-8000-000000000001','ACADEMIC_READ','Lectura académica','Laboratorio sintético'),
 ('92000000-0000-4000-8000-000000000002','ACADEMIC_PROGRESS','Avance académico','Laboratorio sintético');
INSERT INTO lawware.rol_permiso(id_rol,id_permiso) VALUES
 ('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001'),
 ('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002');
INSERT INTO lawware.usuario_rol(id_usuario,id_rol) VALUES
 ('90000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001');
INSERT INTO lawware.modulo(id_modulo,titulo,descripcion,nivel,estado,orden) VALUES
 ('93000000-0000-4000-8000-000000000001','Módulo sintético','Contenido de laboratorio','BASICO','PUBLICADO',1);
INSERT INTO lawware.leccion(id_leccion,id_modulo,orden,creado_por) VALUES
 ('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',1,'90000000-0000-4000-8000-000000000001');
INSERT INTO lawware.leccion_version(id_leccion_version,id_leccion,numero_version,titulo,contenido,creado_por) VALUES
 ('95000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',1,'Lección sintética','Contenido de laboratorio.','90000000-0000-4000-8000-000000000001');
UPDATE lawware.leccion_version SET estado='PUBLICADA',fecha_publicacion=clock_timestamp()
 WHERE id_leccion_version='95000000-0000-4000-8000-000000000001';
