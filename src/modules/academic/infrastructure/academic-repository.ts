import type pg from 'pg';
import { requireCapability } from '../../authorization/application/capabilities.js';
import { HttpError } from '../../../shared/errors/http-error.js';

// Solo nombres constantes: admite el borrador anterior y prefiere la nueva vista
// candidata sin modificar el contrato de la vista canónica de cinco columnas.
async function lessonView(client: pg.PoolClient): Promise<'lawware.v_lecciones_academicas' | 'lawware.v_lecciones_publicadas'> {
  const result = await client.query<{ present: boolean }>("SELECT to_regclass('lawware.v_lecciones_academicas') IS NOT NULL AS present");
  return result.rows[0]?.present ? 'lawware.v_lecciones_academicas' : 'lawware.v_lecciones_publicadas';
}
export async function listModules(client: pg.PoolClient) {
  await requireCapability(client, 'ACADEMIC_READ');
  return (await client.query('SELECT id_modulo,titulo,descripcion,nivel,orden FROM lawware.v_modulos_publicados ORDER BY orden,id_modulo')).rows;
}
export async function listLessons(client: pg.PoolClient, moduleId: string) {
  await requireCapability(client, 'ACADEMIC_READ');
  const module = await client.query('SELECT 1 FROM lawware.v_modulos_publicados WHERE id_modulo=$1', [moduleId]);
  if (!module.rowCount) throw new HttpError(404, 'NOT_FOUND');
  const view = await lessonView(client);
  return (await client.query(`SELECT id_leccion_version,id_leccion,titulo,orden FROM ${view} WHERE id_modulo=$1 ORDER BY orden,id_leccion_version`, [moduleId])).rows;
}
export async function lesson(client: pg.PoolClient, versionId: string) {
  await requireCapability(client, 'ACADEMIC_READ');
  const view = await lessonView(client);
  const result = await client.query(`SELECT id_leccion_version,id_leccion,id_modulo,titulo,contenido FROM ${view} WHERE id_leccion_version=$1`, [versionId]);
  if (!result.rowCount) throw new HttpError(404, 'NOT_FOUND');
  return result.rows[0];
}
export async function progress(client: pg.PoolClient, userId: string) {
  await requireCapability(client, 'ACADEMIC_READ');
  return (await client.query(`SELECT a.id_leccion_version,a.estado,a.fecha_inicio,a.fecha_completado
    FROM lawware.avance_leccion a JOIN lawware.v_lecciones_publicadas v USING(id_leccion_version)
    WHERE a.id_usuario=$1 ORDER BY a.fecha_actualizacion DESC`, [userId])).rows;
}
export async function saveProgress(client: pg.PoolClient, userId: string, versionId: string, state: 'EN_PROGRESO' | 'COMPLETADA') {
  await requireCapability(client, 'ACADEMIC_READ');
  await requireCapability(client, 'ACADEMIC_PROGRESS');
  const available = await client.query<{ disponible: boolean }>('SELECT lawware.fn_bloquear_leccion_publicada($1) AS disponible', [versionId]);
  if (!available.rows[0]?.disponible) throw new HttpError(404, 'NOT_FOUND');
  const result = await client.query(`INSERT INTO lawware.avance_leccion(id_usuario,id_leccion_version,estado,fecha_inicio,fecha_completado)
    VALUES ($1::uuid,$2::uuid,$3::varchar,clock_timestamp(),CASE WHEN $3::varchar='COMPLETADA' THEN clock_timestamp() ELSE NULL END)
    ON CONFLICT(id_usuario,id_leccion_version) DO UPDATE SET
      estado=CASE WHEN lawware.avance_leccion.estado='COMPLETADA' THEN 'COMPLETADA' ELSE EXCLUDED.estado END,
      fecha_inicio=COALESCE(lawware.avance_leccion.fecha_inicio,EXCLUDED.fecha_inicio),
      fecha_completado=COALESCE(lawware.avance_leccion.fecha_completado,EXCLUDED.fecha_completado),
      fecha_actualizacion=clock_timestamp()
    RETURNING id_leccion_version,estado,fecha_inicio,fecha_completado`, [userId, versionId, state]);
  if (!result.rowCount) throw new HttpError(404, 'NOT_FOUND');
  return result.rows[0];
}
